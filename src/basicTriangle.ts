import triangleVert from './shaders/triangle.vert.wgsl?raw'
import colorFrag from './shaders/color.frag.wgsl?raw'

// initialize webgpu device & config canvas context
async function initWebGPU(canvas: HTMLCanvasElement) {
  if (!navigator.gpu) throw new Error('Not Suppot WebGPU')

  const adaptor = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if (!adaptor) throw new Error('No Adaptor found')

  const device = await adaptor.requestDevice()
  const context = canvas.getContext('webgpu') as GPUCanvasContext

  const format = navigator.gpu.getPreferredCanvasFormat()
  const devicePixelRadio = window.devicePixelRatio || 1

  const size = {
    width: canvas.width * devicePixelRadio,
    height: canvas.height * devicePixelRadio,
  }

  canvas.width = size.width
  canvas.height = size.height

  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  })

  return { device, context, format, size }
}

async function initPipeline(device: GPUDevice, format: GPUTextureFormat): Promise<GPURenderPipeline> {
  const descriptor: GPURenderPipelineDescriptor = {
    vertex: {
      module: device.createShaderModule({
        code: triangleVert,
      }),
      entryPoint: 'main',
    },
    fragment: {
      module: device.createShaderModule({
        code: colorFrag,
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
    },
    layout: 'auto',
  }

  return await device.createRenderPipelineAsync(descriptor)
}

function draw(device: GPUDevice, context: GPUCanvasContext, pipeline: GPURenderPipeline) {
  const commandEncoder = device.createCommandEncoder()
  const view = context.getCurrentTexture().createView()

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view,
        loadOp: 'clear',
        clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
        storeOp: 'store',
      },
    ],
  }

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor)
  passEncoder.setPipeline(pipeline)

  passEncoder.draw(3)
  passEncoder.end()

  const gpuCommanBuffer = commandEncoder.finish()
  device.queue.submit([gpuCommanBuffer])
}

async function run() {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('No canvas found')

  const { device, context, format } = await initWebGPU(canvas)
  const pipeline = await initPipeline(device, format)

  draw(device, context, pipeline)

  window.addEventListener('resize', () => {
    console.log(canvas.clientHeight)
    canvas.width = canvas.clientWidth * devicePixelRatio
    canvas.height = canvas.clientHeight * devicePixelRatio

    draw(device, context, pipeline)
  })
}

run()
