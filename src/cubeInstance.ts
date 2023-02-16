import vertexShader from './shaders/basic.instance.vert.wgsl?raw'
import fragmentShader from './shaders/position.frag.wgsl?raw'
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
    label: 'basic',
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

  device.queue.writeBuffer(vertexBuffer, 0, cube.vertex)

  const mvpBuffer = device.createBuffer({
    label: 'uniform buffer',
    size: 4 * 4 * 4 * NUM,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
  passEncoder.setBindGroup(0, pipeLineEntity.group)
  passEncoder.draw(cube.vertexCount, NUM)
  passEncoder.end()

  device.queue.submit([commandEncoder.finish()])
}

const NUM = 10000
async function run() {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('no canvas found')
  const { device, context, format, size } = await initWebGPU(canvas)
  const pipeLineEntity = await initPipeline(device, format, size)

  let aspectRatio = size.width / size.height
  const scene: any[] = []
  const mvpBufferArray = new Float32Array(4 * 4 * NUM)

  for (let i = 0; i < NUM; i++) {
    const position = { x: Math.random() * 40 - 20, y: Math.random() * 40 - 20, z: -40 - Math.random() * 50 }
    const rotation = { x: 0, y: 0, z: 0 }
    const scale = { x: 1, y: 1, z: 1 }

    scene.push({ position, rotation, scale })
  }

  function frame() {
    const now = Date.now() / 1000
    for (let i = 0; i < scene.length; i++) {
      const obj = scene[i]
      obj.rotation.x = Math.sin(now + i)
      obj.rotation.y = Math.cos(now + i)

      const mvpMatrix = getMvpMatrix(aspectRatio, obj.position, obj.rotation, obj.scale)
      mvpBufferArray.set(mvpMatrix, i * 4 * 4)
    }

    device.queue.writeBuffer(pipeLineEntity.mvpBuffer, 0, mvpBufferArray)
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
    pipeLineEntity.depthView = pipeLineEntity.depthTexture.createView()
    aspectRatio = size.width / size.height
  })
}

run()
