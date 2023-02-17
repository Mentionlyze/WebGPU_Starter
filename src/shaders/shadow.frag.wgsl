@group(1) @binding(0) var<uniform> lightPosition : vec4<f32>;
@group(1) @binding(1) var shadowMap : texture_depth_2d;
@group(1) @binding(2) var shadowSampler : sampler_comparison;

@fragment
fn main(
  @location(0) fragPosition : vec3<f32>,
  @location(1) fragNormal : vec3<f32>,
  @location(2) fragUV : vec2<f32>,
  @location(3) fragColor : vec4<f32>,
  @location(4) shadowPos : vec3<f32>
) -> @location(0) vec4<f32> {
  let objectColor = fragColor.rgb;
  var diffuse : f32 = max(dot(normalize(lightPosition.xyz), fragNormal), 0.0);

  var shadow : f32 = 0.0;

  let size = f32(textureDimensions(shadowMap).x);
  for (var y : i32 = -1; y <= 1; y = y + 1) {
    for (var x : i32 = -1; x <= 1; x = x + 1) {
      let offset = vec2<f32>(f32(x) / size, f32(y) / size);
      shadow = shadow + textureSampleCompare(
        shadowMap,
        shadowSampler,
        shadowPos.xy + offset,
        shadowPos.z - 0.005
      );
    }
  }

  shadow = shadow / 9.0;

  let lightFactor = min(0.3 + shadow * diffuse, 1.0);

  return vec4<f32>(objectColor * lightFactor, 1.0);
}