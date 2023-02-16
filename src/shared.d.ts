declare type PartialByKeys<T, K extends keyof T> = {
  [P in K]?: T[P]
} & Pick<T, Exclude<keyof T, K>>

declare type RequiredByKeys<T, K extends keyof T> = {
  [P in K]-?: T[P]
} & Pick<T, Exclude<keyof T, K>>

declare type RequiredByPartialKeys<T, K extends keyof T> = {
  [P in K]-?: T[P]
} & Pick<Partial<T>, Exclude<keyof T, K>>

declare type ColorAttachmentsCallback = (
  device: GPUDevice,
  context: GPUCanvasContext
) => { colorAttachments: Iterable<GPURenderPassColorAttachment | null>; commandEncoder: GPUCommandEncoder }
