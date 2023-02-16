async function initWebGPU() {
  try {
    if (!navigator.gpu) throw new Error('Not support gpu')

    const adaptor = await navigator.gpu.requestAdapter()
    if (!adaptor) throw new Error('Not find adaptor')

    console.log(adaptor)

    adaptor.features.forEach((value) => console.log(value))

    document.body.innerHTML = '<h1>Hello WebGPU</h1>'

    let i: keyof GPUSupportedLimits
    for (i in adaptor.limits) {
      document.body.innerHTML += `<p>${i}: ${adaptor.limits[i]}</p>`
    }
  } catch (error: any) {
    document.body.innerHTML = `<h1>${error.message}</h1>`
  }
}

initWebGPU()
