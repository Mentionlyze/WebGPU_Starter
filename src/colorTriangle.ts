import vertexShader from './shaders/position.vert.wgsl?raw'
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
    width: canvas.clientWidth * devicePixelRadio,
    height: canvas.clientHeight * devicePixelRadio,
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

async function initPipeline(device: GPUDevice, format: GPUTextureFormat) {
  const vertices = new Float32Array([0.0, 0.5, 0.0, -0.5, -0.5, 0.0, 0.5, -0.5, 0.0])

  const vertexBuffer = device.createBuffer({
    label: 'vertex',
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  })

  device.queue.writeBuffer(vertexBuffer, 0, vertices)

  const fragment = new Float32Array([0.5, 0.2, 0.3, 1.0])

  const fragmentBuffer = device.createBuffer({
    label: 'fragment',
    size: fragment.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  device.queue.writeBuffer(fragmentBuffer, 0, fragment)

  const descriptor: GPURenderPipelineDescriptor = {
    vertex: {
      module: device.createShaderModule({
        code: vertexShader,
      }),
      entryPoint: 'main',
      buffers: [
        {
          arrayStride: 3 * 4, // 3 float32,
          attributes: [
            {
              // position xyz
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            },
          ],
        },
      ],
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

  const vertexObj = {
    vertices,
    vertexBuffer,
    vertexCount: 3,
  }

  const pipeline = await device.createRenderPipelineAsync(descriptor)

  const group = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: fragmentBuffer,
        },
      },
    ],
  })

  const fragmentObj = {
    fragment,
    fragmentBuffer,
    group,
  }

  return {
    vertexObj,
    pipeline,
    fragmentObj,
  }
}

function draw(device: GPUDevice, context: GPUCanvasContext, pipeline: GPURenderPipeline, vertexObj: any, fragmentObj: any) {
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
  passEncoder.setVertexBuffer(0, vertexObj.vertexBuffer)

  passEncoder.setBindGroup(0, fragmentObj.group)

  passEncoder.draw(vertexObj.vertexCount)
  passEncoder.end()

  const gpuCommanBuffer = commandEncoder.finish()
  device.queue.submit([gpuCommanBuffer])
}

async function run() {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('No canvas found')

  const { device, context, format } = await initWebGPU(canvas)
  const { pipeline, vertexObj, fragmentObj } = await initPipeline(device, format)

  draw(device, context, pipeline, vertexObj, fragmentObj)

  document.querySelector('input[type="color"]')?.addEventListener('change', (e) => {
    console.log(e)
    const value = (e.target as HTMLInputElement).value
    const r = +('0x' + value.slice(1, 3)) / 255
    const g = +('0x' + value.slice(3, 5)) / 255
    const b = +('0x' + value.slice(5, 7)) / 255
    fragmentObj.fragment[0] = r
    fragmentObj.fragment[1] = g
    fragmentObj.fragment[2] = b
    console.log(fragmentObj.fragment)
    device.queue.writeBuffer(fragmentObj.fragmentBuffer, 0, fragmentObj.fragment)
    draw(device, context, pipeline, vertexObj, fragmentObj)
  })

  document.querySelector('input[type="range"]')?.addEventListener('change', (e) => {
    const value = +(e.target as HTMLInputElement).value
    console.log(value)
    vertexObj.vertices[0] = 0 + value
    vertexObj.vertices[3] = -0.5 + value
    vertexObj.vertices[6] = 0.5 + value

    device.queue.writeBuffer(vertexObj.vertexBuffer, 0, vertexObj.vertices)
    draw(device, context, pipeline, vertexObj, fragmentObj)
  })

  window.addEventListener('resize', () => {
    console.log(canvas.clientHeight)
    canvas.width = canvas.clientWidth * devicePixelRatio
    canvas.height = canvas.clientHeight * devicePixelRatio

    draw(device, context, pipeline, vertexObj, fragmentObj)
  })
}

run()
