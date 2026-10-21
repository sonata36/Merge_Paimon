import type { LevelConfig } from '../config/LevelCatalog';

type MatterFactories = {
  bodies: MatterJS.BodiesFactory;
  body: MatterJS.BodyFactory;
};

/** 各子体相对于贴图中心放置，交给 Matter 组成一个可旋转的刚体。 */
export function createCompoundBody(
  config: LevelConfig,
  x: number,
  y: number,
  matter: MatterFactories,
): MatterJS.BodyType {
  const parts = config.parts.map((part) => {
    const partX = x + part.x * config.radius;
    const partY = y + part.y * config.radius;
    if (part.kind === 'circle') {
      return matter.bodies.circle(partX, partY, part.radius * config.radius);
    }
    return matter.bodies.rectangle(
      partX,
      partY,
      part.width * config.radius,
      part.height * config.radius,
    );
  });

  return matter.body.create({
    parts,
    restitution: 0.08,
    friction: 0.65,
    frictionStatic: 0.8,
    frictionAir: 0.01,
  });
}
