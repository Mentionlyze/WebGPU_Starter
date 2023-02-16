@fragment
fn main(
  @location(0) fragPosition : vec4<f32>,
  @location(1) fragNormal : vec3<f32>,
  @location(2) fragUV : vec2<f32>,
  @location(3) fragColor : vec4<f32>
) -> @location(0) vec4<f32> {
  return fragColor;
}