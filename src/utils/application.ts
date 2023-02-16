import { createVertexShader, createFragmentShader } from './helpers'

interface PipeLineSource {
  vertextShaderSource: string
  vertextEntryPoint: string
  fragmentShaderSource: string
  fragmentEntryPoint: string
  fragmentStateTargets: Iterable<GPUColorTargetState | null>
  primitiveTopology: GPUPrimitiveTopology | undefined
  layout: 'auto' | GPUPipelineLayout
}

export async function createApp(canvas: HTMLCanvasElement) {
  const BufferLayers: Iterable<GPUCommandBuffer> = []

  const { context, device, format, size } = await initWebGPU(canvas)

  const defaultPiplineSource: RequiredByPartialKeys<
    PipeLineSource,
    'vertextEntryPoint' | 'fragmentEntryPoint' | 'fragmentStateTargets' | 'primitiveTopology' | 'layout'
  > = {
    vertextEntryPoint: 'main',
    fragmentEntryPoint: 'main',
    fragmentStateTargets: [{ format }],
    primitiveTopology: 'triangle-list',
    layout: 'auto',
  }

  async function definePipeline(pipelineSource: PipeLineSource) {
    const finalSource: PipeLineSource = { ...defaultPiplineSource, ...pipelineSource }

    const {
      vertextShaderSource,
      vertextEntryPoint,
      fragmentShaderSource,
      fragmentEntryPoint,
      fragmentStateTargets,
      primitiveTopology,
      layout,
    } = finalSource

    const verterShader = createVertexShader(device, vertextShaderSource, vertextEntryPoint)

    const fragmentShader = createFragmentShader(device, fragmentShaderSource, fragmentEntryPoint, fragmentStateTargets)

    const descriptor: GPURenderPipelineDescriptor = {
      vertex: verterShader,
      fragment: fragmentShader,
      primitive: {
        topology: primitiveTopology,
      },
      layout,
    }

    return await device.createRenderPipelineAsync(descriptor)
  }

  function pushLayer(pipeline: GPURenderPipeline, colorAttachmentsCallback: ColorAttachmentsCallback) {
    const { commandEncoder, colorAttachments } = colorAttachmentsCallback(device, context)

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments,
    }

    const passEncoder = 
  }

  function run() {}

  return {
    definePipeline,
    run,
  }
}

async function initWebGPU(canvas: HTMLCanvasElement, alphaMode: GPUCanvasAlphaMode = 'opaque') {
  if (!navigator.gpu) throw new Error('Not support WebGPU')

  const adaptor = await navigator.gpu.requestAdapter()
  if (!adaptor) throw new Error('No Adaptor found')

  const device = await adaptor.requestDevice()
  const context = canvas.getContext('webgpu') as GPUCanvasContext

  const format = navigator.gpu.getPreferredCanvasFormat()
  const devicePixelRatio = window.devicePixelRatio || 1

  const size = {
    width: canvas.width * devicePixelRatio,
    height: canvas.height * devicePixelRatio,
  }

  context.configure({
    device,
    format,
    alphaMode,
  })

  return {
    device,
    context,
    format,
    size,
  }
}
