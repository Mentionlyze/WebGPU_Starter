import vertexShader from './shaders/shadow.vert.wgsl?raw'
import fragmentShader from './shaders/shadow.frag.wgsl?raw'
import shadowDepthShader from './shaders/shadowDepth.wgsl?raw'
import * as box from './utils/box'
import { getModelViewMatrix, getProjectionMatrix } from './utils/math'
import * as sphere from './utils/sphere'
import { mat4, vec3 } from 'gl-matrix'

async function initWebGPU(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) throw new Error('gpu not support')
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error('no adapter')
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu') as GPUCanvasContext
  const format = navigator.gpu.getPreferredCanvasFormat()

  canvas.width = canvas.clientWidth * devicePixelRatio
  canvas.height = canvas.clientHeight * devicePixelRatio

  const size = { width: canvas.width, height: canvas.height }

  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  })

  return { device, context, format, size }
}

async function initPipeline(device: GPUDevice, format: GPUTextureFormat, size: { width: number; height: number }) {
  const vertexBuffers: Iterable<GPUVertexBufferLayout> = [
    {
      arrayStride: 8 * 4,
      attributes: [
        {
          shaderLocation: 0,
          offset: 0,
          format: 'float32x3',
        },
        {
          shaderLocation: 1,
          offset: 3 * 4,
          format: 'float32x3',
        },
        {
          shaderLocation: 2,
          offset: 6 * 4,
          format: 'float32x2',
        },
      ],
    },
  ]

  const primitive: GPUPrimitiveState = {
    topology: 'triangle-list',
    cullMode: 'back',
  }

  const depthStencil: GPUDepthStencilState = {
    depthWriteEnabled: true,
    depthCompare: 'less',
    format: 'depth32float',
  }

  const shadowPipeline = await device.createRenderPipelineAsync({
    label: 'shadow pipeline',
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: shadowDepthShader,
      }),
      entryPoint: 'main',
      buffers: vertexBuffers,
    },
    primitive,
    depthStencil,
  })

  const shadowDepthTexture = device.createTexture({
    size: [2048, 2048],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'depth32float',
  })

  const shadowDepthView = shadowDepthTexture.createView()

  const renderPipeline = await device.createRenderPipelineAsync({
    label: 'Render Pipeline',
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: vertexShader,
      }),
      entryPoint: 'main',
      buffers: vertexBuffers,
    },
    fragment: {
      module: device.createShaderModule({
        code: fragmentShader,
      }),
      entryPoint: 'main',
      targets: [
        {
          format,
        },
      ],
    },
    primitive,
    depthStencil,
  })

  const renderDepthTexture = device.createTexture({
    size,
    format: 'depth32float',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })

  const renderDepthView = renderDepthTexture.createView()

  const boxBuffer = {
    vertex: device.createBuffer({
      size: box.vertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    index: device.createBuffer({
      size: box.index.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    }),
  }

  const sphereBuffer = {
    vertex: device.createBuffer({
      size: sphere.vertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    index: device.createBuffer({
      size: sphere.index.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    }),
  }

  device.queue.writeBuffer(boxBuffer.vertex, 0, box.vertex)
  device.queue.writeBuffer(boxBuffer.index, 0, box.index)
  device.queue.writeBuffer(sphereBuffer.vertex, 0, sphere.vertex)
  device.queue.writeBuffer(sphereBuffer.index, 0, sphere.index)

  const modelViewBuffer = device.createBuffer({
    size: 4 * 4 * 4 * NUM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const cameraProjectionBuffer = device.createBuffer({
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const lightProjectionBuffer = device.createBuffer({
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const colorBuffer = device.createBuffer({
    size: 4 * 4 * NUM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const vsGroup = device.createBindGroup({
    label: 'group for renderPass',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: modelViewBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: cameraProjectionBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: lightProjectionBuffer,
        },
      },
      {
        binding: 3,
        resource: {
          buffer: colorBuffer,
        },
      },
    ],
  })

  const lightPositionBuffer = device.createBuffer({
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const fsGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: lightPositionBuffer,
        },
      },
      {
        binding: 1,
        resource: shadowDepthView,
      },
      {
        binding: 2,
        resource: device.createSampler({
          compare: 'less',
        }),
      },
    ],
  })

  const shadowGroup = device.createBindGroup({
    layout: shadowPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: modelViewBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: lightProjectionBuffer,
        },
      },
    ],
  })

  return {
    shadowPipeline,
    renderPipeline,
    boxBuffer,
    sphereBuffer,
    modelViewBuffer,
    cameraProjectionBuffer,
    lightProjectionBuffer,
    colorBuffer,
    vsGroup,
    lightPositionBuffer,
    fsGroup,
    shadowGroup,
    renderDepthTexture,
    renderDepthView,
    shadowDepthTexture,
    shadowDepthView,
  }
}

function draw(
  device: GPUDevice,
  context: GPUCanvasContext,
  pipeLineEntity: {
    shadowPipeline: GPURenderPipeline
    renderPipeline: GPURenderPipeline
    boxBuffer: { vertex: GPUBuffer; index: GPUBuffer }
    sphereBuffer: { vertex: GPUBuffer; index: GPUBuffer }
    modelViewBuffer: GPUBuffer
    cameraProjectionBuffer: GPUBuffer
    lightProjectionBuffer: GPUBuffer
    colorBuffer: GPUBuffer
    vsGroup: GPUBindGroup
    lightPositionBuffer: GPUBuffer
    fsGroup: GPUBindGroup
    shadowGroup: GPUBindGroup
    renderDepthTexture: GPUTexture
    renderDepthView: GPUTextureView
    shadowDepthTexture: GPUTexture
    shadowDepthView: GPUTextureView
  }
) {
  const commandEncoder = device.createCommandEncoder()

  const shadowPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [],
    depthStencilAttachment: {
      view: pipeLineEntity.shadowDepthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  }

  const shadowPassEncoder = commandEncoder.beginRenderPass(shadowPassDescriptor)
  shadowPassEncoder.setPipeline(pipeLineEntity.shadowPipeline)
  shadowPassEncoder.setBindGroup(0, pipeLineEntity.shadowGroup)

  shadowPassEncoder.setVertexBuffer(0, pipeLineEntity.boxBuffer.vertex)
  shadowPassEncoder.setIndexBuffer(pipeLineEntity.boxBuffer.index, 'uint16')
  shadowPassEncoder.drawIndexed(box.indexCount, 2, 0, 0, 0)

  shadowPassEncoder.setVertexBuffer(0, pipeLineEntity.sphereBuffer.vertex)
  shadowPassEncoder.setIndexBuffer(pipeLineEntity.sphereBuffer.index, 'uint16')
  shadowPassEncoder.drawIndexed(sphere.indexCount, NUM - 2, 0, 0, 2)

  shadowPassEncoder.end()

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: pipeLineEntity.renderDepthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  }

  const renderPassEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
  renderPassEncoder.setPipeline(pipeLineEntity.renderPipeline)
  renderPassEncoder.setBindGroup(0, pipeLineEntity.vsGroup)
  renderPassEncoder.setBindGroup(1, pipeLineEntity.fsGroup)

  renderPassEncoder.setVertexBuffer(0, pipeLineEntity.boxBuffer.vertex)
  renderPassEncoder.setIndexBuffer(pipeLineEntity.boxBuffer.index, 'uint16')
  renderPassEncoder.drawIndexed(box.indexCount, 2, 0, 0, 0)

  renderPassEncoder.setVertexBuffer(0, pipeLineEntity.sphereBuffer.vertex)
  renderPassEncoder.setIndexBuffer(pipeLineEntity.sphereBuffer.index, 'uint16')
  renderPassEncoder.drawIndexed(sphere.indexCount, NUM - 2, 0, 0, 2)

  renderPassEncoder.end()

  device.queue.submit([commandEncoder.finish()])
}

const NUM = 30
async function run() {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement
  if (!canvas) throw new Error('no canvas')

  const { device, context, format, size } = await initWebGPU(canvas)
  const pipeLineEntity = await initPipeline(device, format, size)

  const scene: any[] = []
  const modelViewMatrixArray = new Float32Array(4 * 4 * NUM)
  const colorBufferArray = new Float32Array(4 * NUM)

  {
    const position = { x: 0, y: 0, z: -20 }
    const rotation = { x: 0, y: Math.PI / 4, z: 0 }
    const scale = { x: 2, y: 20, z: 2 }
    const modelView = getModelViewMatrix(position, rotation, scale)
    modelViewMatrixArray.set(modelView, 0 * 4 * 4)
    // random color for each object
    colorBufferArray.set([0.5, 0.5, 0.5, 1], 0 * 4)
    scene.push({ position, rotation, scale })
  }

  {
    const position = { x: 0, y: -10, z: -20 }
    const rotation = { x: 0, y: 0, z: 0 }
    const scale = { x: 50, y: 0.5, z: 40 }
    const modelView = getModelViewMatrix(position, rotation, scale)
    modelViewMatrixArray.set(modelView, 1 * 4 * 4)
    // random color for each object
    colorBufferArray.set([1, 1, 1, 1], 1 * 4)
    scene.push({ position, rotation, scale })
  }

  // add spheres
  for (let i = 2; i < NUM; i++) {
    // craete simple object
    const or = Math.random() > 0.5 ? 1 : -1
    const position = { x: (1 + Math.random() * 12) * or, y: -8 + Math.random() * 15, z: -20 + (1 + Math.random() * 12) * or }
    const rotation = { x: Math.random(), y: Math.random(), z: Math.random() }
    const s = Math.max(0.5, Math.random())
    const scale = { x: s, y: s, z: s }
    const modelView = getModelViewMatrix(position, rotation, scale)
    modelViewMatrixArray.set(modelView, i * 4 * 4)
    // random color for each object
    colorBufferArray.set([Math.random(), Math.random(), Math.random(), 1], i * 4)
    scene.push({ position, rotation, scale, y: position.y, v: Math.max(0.09, Math.random() / 10) * or })
  }

  device.queue.writeBuffer(pipeLineEntity.colorBuffer, 0, colorBufferArray)

  const lightViewMatrix = mat4.create()
  const lightProjectionMatrix = mat4.create()
  const lightPosition = vec3.fromValues(0, 100, 0)
  const up = vec3.fromValues(0, 1, 0)
  const origin = vec3.fromValues(0, 0, 0)

  function frame() {
    const now = performance.now()
    lightPosition[0] = Math.sin(now / 1500) * 50
    lightPosition[2] = Math.cos(now / 1500) * 50

    mat4.lookAt(lightViewMatrix, lightPosition, origin, up)
    mat4.ortho(lightProjectionMatrix, -40, 40, -40, 40, -50, 200)
    mat4.multiply(lightProjectionMatrix, lightProjectionMatrix, lightViewMatrix)

    device.queue.writeBuffer(pipeLineEntity.lightProjectionBuffer, 0, lightProjectionMatrix as Float32Array)
    device.queue.writeBuffer(pipeLineEntity.lightPositionBuffer, 0, lightPosition as Float32Array)

    for (let i = 2; i < NUM; i++) {
      const obj = scene[i]
      obj.position.y += obj.v
      if (obj.position.y < -9 || obj.position.y > 9) {
        obj.v *= -1
      }
      const modelView = getModelViewMatrix(obj.position, obj.rotation, obj.scale)
      modelViewMatrixArray.set(modelView, i * 4 * 4)
    }
    device.queue.writeBuffer(pipeLineEntity.modelViewBuffer, 0, modelViewMatrixArray)

    draw(device, context, pipeLineEntity)

    requestAnimationFrame(frame)
  }

  frame()

  function updateCamera() {
    const aspect = size.width / size.height
    const projectionMatrix = getProjectionMatrix(aspect, (60 / 180) * Math.PI, 0.1, 1000, { x: 0, y: 10, z: 20 })
    device.queue.writeBuffer(pipeLineEntity.cameraProjectionBuffer, 0, projectionMatrix)
  }
  updateCamera()

  window.addEventListener('resize', () => {
    size.width = canvas.width = canvas.clientWidth * devicePixelRatio
    size.height = canvas.height = canvas.clientHeight * devicePixelRatio

    pipeLineEntity.renderDepthTexture.destroy()
    pipeLineEntity.renderDepthTexture = device.createTexture({
      size,
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    pipeLineEntity.renderDepthView = pipeLineEntity.renderDepthTexture.createView()
    updateCamera()
  })
}

run()
