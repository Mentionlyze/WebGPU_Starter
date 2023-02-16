import vertexShader from './shaders/basic.vert.wgsl?raw'
import fragmentShader from './shaders/position.frag.wgsl?raw'
import * as cube from './utils/cube'
import { getMvpMatrix } from './utils/math'

// initialize webgpu device & config canvas context
async function initWebGPU(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) throw new Error('WebGPU not Suppot')

  const adaptor = await navigator.gpu.requestAdapter()
  if (!adaptor) throw new Error('No Adaptor found')

  const device = await adaptor.requestDevice()
  const context = canvas.getContext('webgpu') as GPUCanvasContext

  const format = navigator.gpu.getPreferredCanvasFormat()

  const devicePixelRadio = window.devicePixelRatio || 1
  canvas.width = canvas.clientWidth * devicePixelRadio
  canvas.height = canvas.clientHeight * devicePixelRadio
  const size = { width: canvas.width, height: canvas.height }

  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  })

  return { device, context, format, size }
}

// create pipelines and buffers
async function initPipeline(device: GPUDevice, format: GPUTextureFormat, size: { width: number; height: number }) {
  const pipeLine = await device.createRenderPipelineAsync({
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
      // cullMode: 'back',
      frontFace: 'ccw',
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: 'less',
      format: 'depth24plus',
    },
  } as GPURenderPipelineDescriptor)

  const depthTexture = device.createTexture({
    size,
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  })

  const depthView = depthTexture.createView()

  const vertexBuffer = device.createBuffer({
    label: 'GPUBuffer store vertext',
    size: cube.vertex.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })

  device.queue.writeBuffer(vertexBuffer, 0, cube.vertex)

  const mvpBuffer = device.createBuffer({
    label: 'GPUBuffer store 4 * 4 matrix',
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const uniformGroup = device.createBindGroup({
    label: 'Uniform Group with Matrix',
    layout: pipeLine.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: mvpBuffer,
        },
      },
    ],
  })

  return { pipeLine, vertexBuffer, mvpBuffer, uniformGroup, depthTexture, depthView }
}

function draw(
  device: GPUDevice,
  context: GPUCanvasContext,
  pipeLineEntity: {
    pipeLine: GPURenderPipeline
    vertexBuffer: GPUBuffer
    mvpBuffer: GPUBuffer
    uniformGroup: GPUBindGroup
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
  passEncoder.setPipeline(pipeLineEntity.pipeLine)

  passEncoder.setVertexBuffer(0, pipeLineEntity.vertexBuffer)
  passEncoder.setBindGroup(0, pipeLineEntity.uniformGroup)

  passEncoder.draw(cube.vertexCount)
  passEncoder.end()

  device.queue.submit([commandEncoder.finish()])
}

async function run() {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')

  const { device, context, format, size } = await initWebGPU(canvas)
  const pipeLineEntity = await initPipeline(device, format, size)

  let aspectRatio = size.width / size.height
  const position = { x: 0, y: 0, z: -5 }
  const scale = { x: 1, y: 1, z: 1 }
  const rotation = { x: 0, y: 0, z: 0 }

  function frame() {
    const now = Date.now() / 1000
    rotation.x = Math.sin(now)
    rotation.y = Math.cos(now)
    const mvpMatrix = getMvpMatrix(aspectRatio, position, rotation, scale)

    device.queue.writeBuffer(pipeLineEntity.mvpBuffer, 0, mvpMatrix.buffer)
    draw(device, context, pipeLineEntity)
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
}

run()
