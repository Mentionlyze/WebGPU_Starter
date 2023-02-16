export function createVertexShader(device: GPUDevice, vertextShaderSource: string, vertextEntryPoint: string): GPUVertexState {
  const module = device.createShaderModule({
    code: vertextShaderSource,
  })

  return {
    module,
    entryPoint: vertextEntryPoint,
  }
}

export function createFragmentShader(
  device: GPUDevice,
  fragmentShaderSource: string,
  fragmentEntryPoint: string,
  fragmentStateTargets: Iterable<GPUColorTargetState | null>
): GPUFragmentState {
  const module = device.createShaderModule({
    code: fragmentShaderSource,
  })

  return {
    module,
    entryPoint: fragmentEntryPoint,
    targets: fragmentStateTargets,
  }
}
