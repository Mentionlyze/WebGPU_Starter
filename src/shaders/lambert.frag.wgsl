@group(1) @binding(0) var<uniform> ambientIntensity : f32;
@group(1) @binding(1) var<uniform> directionLight : array<vec4<f32>, 2>;

@fragment
fn main(
  @location(0) fragPosition : vec4<f32>,
  @location(1) fragNormal : vec3<f32>,
  @location(2) fragUV : vec2<f32>,
  @location(3) fragColor : vec4<f32>
) -> @location(0) vec4<f32> {
  let objectColor = fragColor.rgb;
  let ambientLightColor = vec3(1.0, 1.0, 1.0);
  let directionLightColor = vec3(1.0, 1.0, 1.0);

  var lightResult = vec3(0.0, 0.0, 0.0);

  lightResult += ambientLightColor * ambientIntensity;

  var directionPosition = directionLight[0].xyz;
  var directionIntensity: f32 = directionLight[1][0];
  var diffuse: f32 = max(dot(normalize(directionPosition), fragNormal), 0.0);
  lightResult += directionLightColor * directionIntensity * diffuse;

  return vec4<f32>(objectColor * lightResult, 1.0);
}