import vertexShader from './shaders/basic.vert.wgsl?raw'
import fragmentShader from './shaders/position.frag.wgsl?raw'
import * as cube from './utils/cube'
import { getMvpMatrix } from './utils/math'

async function initWebGPU(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) throw new Error('gpu not Suppot')
  const adaptor = await navigator.gpu.requestAdapter()
  if (!adaptor) throw new Error('no adaptor')

  const device = await adaptor.requestDevice()
  const context = canvas.getContext('webgpu') as GPUCanvasContext
  const format = navigator.gpu.getPreferredCanvasFormat()

  canvas.width = canvas.clientWidth * devicePixelRatio || 1
  canvas.height = canvas.clientHeight * devicePixelRatio || 1
  const size = { width: canvas.width, height: canvas.height }

  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  })

  return { device, context, format, size }
}

async function initPipeline(device: GPUDevice, format: GPUTextureFormat, size: { width: number; height: number }) {
  const dynamicBindGroupLayout = device.createBindGroupLayout({
    label: 'dynamic bind group layout',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: {
          type: 'uniform',
          hasDynamicOffset: true,
          minBindingSize: 0,
        },
      },
    ],
  })

  const dynamicPipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [dynamicBindGroupLayout],
  })

  const pipeline = await device.createRenderPipelineAsync({
    label: 'basic layout',
    layout: dynamicPipelineLayout,
    vertex: {
      module: device.createShaderModule({
        code: vertexShader,
      }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: 5 * 4,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            },
            {
              shaderLocation: 1,
              offset: 3 * 4,
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

  const vertexBuffer = device.createBuffer({
    label: 'vertex buffer',
    size: cube.vertex.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })

  device.queue.writeBuffer(vertexBuffer, 0, cube.vertex)

  const mvpBuffer = device.createBuffer({
    label: 'mvp buffer',
    size: 2 * 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const group = device.createBindGroup({
    layout: dynamicBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: mvpBuffer,
          size: 4 * 4 * 4,
        },
      },
    ],
  })

  return { pipeline, vertexBuffer, mvpBuffer, group, depthTexture, depthView }
}

function draw(
  device: GPUDevice,
  context: GPUCanvasContext,
  pipeLineEntity: {
    pipeline: GPURenderPipeline
    vertexBuffer: GPUBuffer
    mvpBuffer: GPUBuffer
    group: GPUBindGroup
    depthTexture: GPUTexture
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
  passEncoder.setVertexBuffer(0, pipeLineEntity.vertexBuffer)

  const offset = new Uint32Array([0, 256])

  {
    passEncoder.setBindGroup(0, pipeLineEntity.group, offset, 0, 1)
    passEncoder.draw(cube.vertexCount)

    passEncoder.setBindGroup(0, pipeLineEntity.group, offset, 1, 1)
    passEncoder.draw(cube.vertexCount)
  }

  passEncoder.end()

  device.queue.submit([commandEncoder.finish()])
}

async function run() {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')

  const { device, context, format, size } = await initWebGPU(canvas)
  const pipeLineEntity = await initPipeline(device, format, size)

  let aspectRatio = size.width / size.height
  const position1 = { x: -2, y: 0, z: -8 }
  const rotationg1 = { x: 0, y: 0, z: 0 }
  const scale1 = { x: 1, y: 1, z: 1 }

  const position2 = { x: 2, y: 0, z: -8 }
  const rotationg2 = { x: 0, y: 0, z: 0 }
  const scale2 = { x: 1, y: 1, z: 1 }

  function frame() {
    const now = Date.now() / 1000

    rotationg1.x = Math.sin(now)
    rotationg1.y = Math.cos(now)

    const mvpMatrix1 = getMvpMatrix(aspectRatio, position1, rotationg1, scale1)
    device.queue.writeBuffer(pipeLineEntity.mvpBuffer, 0, mvpMatrix1)

    rotationg2.x = Math.cos(now)
    rotationg2.y = Math.sin(now)

    const mvpMatrix2 = getMvpMatrix(aspectRatio, position2, rotationg2, scale2)
    device.queue.writeBuffer(pipeLineEntity.mvpBuffer, 256, mvpMatrix2)

    draw(device, context, pipeLineEntity)

    requestAnimationFrame(frame)
  }

  frame()

  window.addEventListener('resize', () => {
    size.width = canvas.width = canvas.clientWidth * devicePixelRatio
    size.height = canvas.height = canvas.clientHeight * devicePixelRatio

    pipeLineEntity.depthTexture.destroy()
    pipeLineEntity.depthTexture = device.createTexture({
      size,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })

    aspectRatio = size.width / size.height
  })
}

run()
