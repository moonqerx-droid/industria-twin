import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { fitHallCamera, hallBoundsCorners } from "@/components/factory3d/cameraFraming";
import { CAMERA_PRESETS } from "@/components/factory3d/sceneContract";

describe("Factory camera framing", () => {
  for (const aspect of [0.6, 1.2, 2.1]) {
    for (const id of ["cam-overview", "cam-top"]) {
      it(`${id} keeps every hall corner visible at aspect ${aspect}`, () => {
        const preset = CAMERA_PRESETS[id]!;
        const camera = new PerspectiveCamera(42, aspect, 0.5, 400);
        camera.position.copy(fitHallCamera(preset, aspect, 42));
        camera.lookAt(new Vector3(...preset.target));
        camera.updateMatrixWorld();
        for (const corner of hallBoundsCorners()) {
          const point = corner.clone().project(camera);
          expect(Math.abs(point.x)).toBeLessThan(0.99);
          expect(Math.abs(point.y)).toBeLessThan(0.99);
        }
      });
    }
  }
});
