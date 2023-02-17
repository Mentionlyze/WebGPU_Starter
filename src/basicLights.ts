import vertexShader from './shaders/normal.vert.wgsl?raw'
import fragmentShader from './shaders/lambert.frag.wgsl?raw'
import * as box from './utils/box'
import * as sphere from './utils/sphere'
import { getModelViewMatrix, getProjectionMatrix } from './utils/math'
import { mat4 } from 'gl-matrix'

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
  const pipeline = await device.createRenderPipelineAsync({
    label: 'basic',
    layout: 'auto',
    vertex: {
      module: device.createShaderModule({
        code: vertexShader,
      }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: 8 * 4, // 3 position 2 uv,
          attributes: [
            {
              // position
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            },
            {
              // normal
              shaderLocation: 1,
              offset: 3 * 4,
              format: 'float32x3',
            },
            {
              // uv
              shaderLocation: 2,
              offset: 6 * 4,
              format: 'float32x2',
            },
          ],
        },
      ],
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
    primitive: {
      topology: 'triangle-list',
      cullMode: 'back',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  })

  const depthTexture = device.createTexture({
    size,
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })

  const depthView = depthTexture.createView()

  const boxBuffer = {
    vertex: device.createBuffer({
      label: 'GPUBuffer store vertex',
      size: box.vertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    index: device.createBuffer({
      label: 'GPUBuffer store index',
      size: box.index.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    }),
  }

  const sphereBuffer = {
    vertex: device.createBuffer({
      label: 'GPUBuffer store vertex',
      size: sphere.vertex.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    }),
    index: device.createBuffer({
      label: 'GPUBuffer store index',
      size: sphere.index.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    }),
  }

  device.queue.writeBuffer(boxBuffer.vertex, 0, box.vertex)
  device.queue.writeBuffer(boxBuffer.index, 0, box.index)
  device.queue.writeBuffer(sphereBuffer.vertex, 0, sphere.vertex)
  device.queue.writeBuffer(sphereBuffer.index, 0, sphere.index)

  const modelViewBuffer = device.createBuffer({
    label: 'model view buffer',
    size: 4 * 4 * 4 * NUM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const projectionBuffer = device.createBuffer({
    label: 'projection buffer',
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const colorBuffer = device.createBuffer({
    label: 'GPUBuffer store n * 4 color',
    size: 4 * 4 * NUM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const normalBuffer = device.createBuffer({
    label: 'normal matrix',
    size: 4 * 4 * 4 * NUM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const vsGroup = device.createBindGroup({
    label: 'vertex group',
    layout: pipeline.getBindGroupLayout(0),
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
          buffer: projectionBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: colorBuffer,
        },
      },
      {
        binding: 3,
        resource: {
          buffer: normalBuffer,
        },
      },
    ],
  })

  const ambientBuffer = device.createBuffer({
    label: 'ambient buffer',
    size: 4 * 1, // 1 x float32: intensity f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const pointLightBuffer = device.createBuffer({
    label: 'point light',
    size: 4 * 4 * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const directionBuffer = device.createBuffer({
    label: 'direction buffer',
    size: 4 * 4 * 2,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const lightGroup = device.createBindGroup({
    label: 'light group',
    layout: pipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: ambientBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: pointLightBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: directionBuffer,
        },
      },
    ],
  })

  return {
    pipeline,
    boxBuffer,
    sphereBuffer,
    modelViewBuffer,
    projectionBuffer,
    colorBuffer,
    normalBuffer,
    vsGroup,
    ambientBuffer,
    pointLightBuffer,
    directionBuffer,
    lightGroup,
    depthTexture,
    depthView,
  }
}

function draw(
  device: GPUDevice,
  context: GPUCanvasContext,
  pipeLineEntity: {
    pipeline: GPURenderPipeline
    boxBuffer: { vertex: GPUBuffer; index: GPUBuffer }
    sphereBuffer: { vertex: GPUBuffer; index: GPUBuffer }
    modelViewBuffer: GPUBuffer
    projectionBuffer: GPUBuffer
    normalBuffer: GPUBuffer
    vsGroup: GPUBindGroup
    ambientBuffer: GPUBuffer
    pointLightBuffer: GPUBuffer
    directionBuffer: GPUBuffer
    lightGroup: GPUBindGroup
    depthView: GPUTextureView
  }
) {
  const commandEncoder = device.createCommandEncoder()
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: pipeLineEntity.depthView,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  }

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
  passEncoder.setPipeline(pipeLineEntity.pipeline)
  passEncoder.setBindGroup(0, pipeLineEntity.vsGroup)
  passEncoder.setBindGroup(1, pipeLineEntity.lightGroup)

  passEncoder.setVertexBuffer(0, pipeLineEntity.boxBuffer.vertex)
  passEncoder.setIndexBuffer(pipeLineEntity.boxBuffer.index, 'uint16')
  passEncoder.drawIndexed(box.indexCount, NUM / 2, 0, 0, 0)

  passEncoder.setVertexBuffer(0, pipeLineEntity.sphereBuffer.vertex)
  passEncoder.setIndexBuffer(pipeLineEntity.sphereBuffer.index, 'uint16')
  passEncoder.drawIndexed(sphere.indexCount, NUM / 2, 0, 0, NUM / 2)

  passEncoder.end()

  device.queue.submit([commandEncoder.finish()])
}

const NUM = 500
async function run() {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('no canvas found')
  const { device, context, format, size } = await initWebGPU(canvas)
  const pipeLineEntity = await initPipeline(device, format, size)

  const scene: any[] = []
  const modelViewBufferArray = new Float32Array(4 * 4 * NUM)
  const colorBufferArray = new Float32Array(4 * NUM)
  const normalBufferArray = new Float32Array(4 * 4 * NUM)

  for (let i = 0; i < NUM; i++) {
    const position = { x: Math.random() * 40 - 20, y: Math.random() * 40 - 20, z: -40 - Math.random() * 50 }
    const rotation = { x: Math.random(), y: Math.random(), z: Math.random() }
    const scale = { x: 1, y: 1, z: 1 }

    const modelViewMatrix = getModelViewMatrix(position, rotation, scale)
    modelViewBufferArray.set(modelViewMatrix, i * 4 * 4)

    const normalMatrix = mat4.create()
    mat4.invert(normalMatrix, modelViewMatrix)
    mat4.transpose(normalMatrix, normalMatrix)
    normalBufferArray.set(normalMatrix, i * 4 * 4)

    colorBufferArray.set([Math.random(), Math.random(), Math.random(), 1.0], i * 4)

    scene.push({ position, rotation, scale })
  }

  device.queue.writeBuffer(pipeLineEntity.modelViewBuffer, 0, modelViewBufferArray)
  device.queue.writeBuffer(pipeLineEntity.colorBuffer, 0, colorBufferArray)
  device.queue.writeBuffer(pipeLineEntity.normalBuffer, 0, normalBufferArray)

  const ambient = new Float32Array([0.1])

  const pointLight = new Float32Array(8)
  pointLight[2] = -50
  pointLight[4] = 1
  pointLight[5] = 20

  const directionalLight = new Float32Array(8)
  directionalLight[4] = 0.5

  function frame() {
    const now = performance.now()

    pointLight[0] = 10 * Math.sin(now / 1000)
    pointLight[1] = 10 * Math.cos(now / 1000)
    pointLight[2] = -60 + 10 * Math.cos(now / 1000)

    directionalLight[0] = Math.sin(now / 1500)
    directionalLight[2] = Math.cos(now / 1500)

    device.queue.writeBuffer(pipeLineEntity.ambientBuffer, 0, ambient)
    device.queue.writeBuffer(pipeLineEntity.pointLightBuffer, 0, pointLight)
    device.queue.writeBuffer(pipeLineEntity.directionBuffer, 0, directionalLight)

    draw(device, context, pipeLineEntity)

    requestAnimationFrame(frame)
  }

  frame()

  document.querySelector('#ambient')?.addEventListener('input', (e: Event) => {
    ambient[0] = +(e.target as HTMLInputElement).value
  })

  document.querySelector('#point')?.addEventListener('input', (e: Event) => {
    pointLight[4] = +(e.target as HTMLInputElement).value
  })

  document.querySelector('#radius')?.addEventListener('input', (e: Event) => {
    pointLight[5] = +(e.target as HTMLInputElement).value
  })

  document.querySelector('#dir')?.addEventListener('input', (e: Event) => {
    directionalLight[4] = +(e.target as HTMLInputElement).value
  })

  function updateCamera() {
    const aspectRatio = size.width / size.height
    const projectionMatrix = getProjectionMatrix(aspectRatio)
    device.queue.writeBuffer(pipeLineEntity.projectionBuffer, 0, projectionMatrix)
  }

  updateCamera()

  window.addEventListener('resize', () => {
    size.width = canvas.width = canvas.clientWidth * devicePixelRatio
    size.height = canvas.height = canvas.clientHeight * devicePixelRatio

    pipeLineEntity.depthTexture.destroy()
    pipeLineEntity.depthTexture = device.createTexture({
      size,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })
    pipeLineEntity.depthView = pipeLineEntity.depthTexture.createView()
    updateCamera()
  })
}

run()
