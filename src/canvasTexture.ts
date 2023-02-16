import vertexShader from './shaders/basic.vert.wgsl?raw'
import fragmentShader from './shaders/imageTexture.frag.wgsl?raw'
import * as cube from './utils/cube'
import { getMvpMatrix } from './utils/math'

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
    label: 'baisc',
    layout: 'auto',
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

  const mvpBuffer = device.createBuffer({
    label: 'uniform buffer',
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const group = device.createBindGroup({
    label: 'group',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: mvpBuffer,
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
  },
  textureGroup: GPUBindGroup
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
  passEncoder.setBindGroup(0, pipeLineEntity.group)
  passEncoder.setBindGroup(1, textureGroup)

  passEncoder.draw(cube.vertexCount)
  passEncoder.end()

  device.queue.submit([commandEncoder.finish()])
}

async function run() {
  const canvas = document.querySelector('canvas#webgpu') as HTMLCanvasElement
  const canvas2 = document.querySelector('canvas#canvas') as HTMLCanvasElement

  if (!canvas || !canvas2) throw new Error('no canvas')

  const { device, context, format, size } = await initWebGPU(canvas)
  const pipeLineEntity = await initPipeline(device, format, size)

  const textureSize = [canvas2.width, canvas2.height]
  const texture = device.createTexture({
    size: textureSize,
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  })

  const sampler = device.createSampler({
    minFilter: 'linear',
    magFilter: 'linear',
  })

  const textureGroup = device.createBindGroup({
    label: 'texture group',
    layout: pipeLineEntity.pipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: texture.createView(),
      },
    ],
  })

  let aspectRatio = size.width / size.height
  const position = { x: 0, y: 0, z: -6 }
  const rotation = { x: 0, y: 0, z: 0 }
  const scale = { x: 1, y: 1, z: 1 }

  function frame() {
    const now = Date.now() / 1000

    rotation.x = Math.sin(now)
    rotation.y = Math.cos(now)

    const mvpMatrix = getMvpMatrix(aspectRatio, position, rotation, scale)
    device.queue.writeBuffer(pipeLineEntity.mvpBuffer, 0, mvpMatrix)
    device.queue.copyExternalImageToTexture({ source: canvas2 }, { texture: texture }, textureSize)

    draw(device, context, pipeLineEntity, textureGroup)

    requestAnimationFrame(frame)
  }

  frame()

  window.addEventListener('resize', () => {
    size.width = canvas.width * window.devicePixelRatio || 1
    size.height = canvas.height * window.devicePixelRatio || 1

    pipeLineEntity.depthTexture.destroy()
    pipeLineEntity.depthTexture = device.createTexture({
      size,
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    })

    pipeLineEntity.depthView = pipeLineEntity.depthTexture.createView()
    aspectRatio = size.width / size.height
  })

  {
    const ctx = canvas2.getContext('2d')
    if (!ctx) throw new Error('No support 2d')

    ctx.fillStyle = '#fff'
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillRect(0, 0, canvas2.width, canvas2.height)

    let drawing = false
    let lastX = 0,
      lastY = 0
    let hue = 0

    canvas2.addEventListener('pointerdown', (e: PointerEvent) => {
      drawing = true
      lastX = e.offsetX
      lastY = e.offsetY
    })

    canvas2.addEventListener('pointermove', (e: PointerEvent) => {
      if (!drawing) return
      const x = e.offsetX
      const y = e.offsetY

      hue = hue > 360 ? 0 : hue + 1
      ctx.strokeStyle = `hsl(${hue}, 90%, 50%)`
      ctx.beginPath()
      ctx.moveTo(lastX, lastY)
      ctx.lineTo(x, y)
      ctx.stroke()

      lastX = x
      lastY = y
    })

    canvas2.addEventListener('pointerup', () => {
      drawing = false
    })
    canvas2.addEventListener('pointerout', () => {
      drawing = false
    })
  }
}

run()
