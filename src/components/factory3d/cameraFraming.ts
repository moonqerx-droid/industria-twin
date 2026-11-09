import { Vector3 } from "three";
import { HALL, type CameraPreset } from "./sceneContract";

/** Fit the actual hall bounds in both axes, including portrait viewports. */
export function fitHallCamera(preset: CameraPreset, aspect: number, fov: number): Vector3 {
  const target = new Vector3(...preset.target);
  const direction = new Vector3(...preset.position).sub(target).normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
  const up = new Vector3().crossVectors(direction, right).normalize();
  const tanVertical = Math.tan(fov * Math.PI / 360);
  const tanHorizontal = tanVertical * Math.max(0.1, aspect);
  let distance = 0;
  // Цех показан в разрезе: высокая только задняя стена, у переднего края — бортик и низкие торцевые стены.
  for (const corner0 of hallBoundsCorners()) {
    const corner = corner0.clone().sub(target);
    distance = Math.max(distance,
      Math.abs(corner.dot(right)) / tanHorizontal + corner.dot(direction),
      Math.abs(corner.dot(up)) / tanVertical + corner.dot(direction));
  }
  return direction.multiplyScalar(distance * 1.04).add(target);
}

/** Габаритные точки видимого объёма цеха (для кадрирования и тестов). */
export function hallBoundsCorners(): Vector3[] {
  const pts: Vector3[] = [];
  const hx = HALL.width / 2 + 0.6;
  const hz = HALL.depth / 2 + 0.6;
  for (const x of [-hx, hx]) {
    pts.push(new Vector3(x, -0.8, -hz), new Vector3(x, HALL.wallHeight, -hz), new Vector3(x, -0.8, hz), new Vector3(x, 2.2, hz));
  }
  return pts;
}
