import * as TypoGeom from "typo-geom";

import { Point, Vec2 } from "./point.mjs";
import { Transform } from "./transform.mjs";
import { mix } from "@iosevka/util";

function contourToRep(contour) {
	let c = [];
	for (const z of contour) c.push({ type: z.type, x: z.x, y: z.y });
	return c;
}
function repToContour(contourRep) {
	let c = [];
	for (const z of contourRep) c.push(Point.fromXY(z.type, z.x, z.y));
	return c;
}
function convertContourToArcs(contour) {
	if (!contour || !contour.length) return [];
	const newContour = [];
	let z0 = Point.from(Point.Type.Corner, contour[0]);
	for (let j = 1; j < contour.length; j++) {
		const z = contour[j];
		switch (z.type) {
			case Point.Type.CubicStart: {
				const z1 = z;
				const z2 = contour[j + 1];
				const z3 = contour[j + 2];
				newContour.push(
					new TypoGeom.Arcs.Bez3(
						z0,
						Point.from(Point.Type.CubicStart, z1),
						Point.from(Point.Type.CubicEnd, z2),
						Point.from(Point.Type.Corner, z3)
					)
				);
				z0 = z3;
				j += 2;
				break;
			}
			case Point.Type.Quadratic: {
				const zc = z;
				let zf = contour[j + 1] || contour[0];
				const zfIsCorner = zf.type === Point.Type.contour;
				if (!zfIsCorner) zf = Point.from(Point.Type.Corner, zc).mix(0.5, zf);
				newContour.push(
					new TypoGeom.Arcs.Bez3(
						z0,
						Point.from(Point.Type.CubicStart, z0).mix(2 / 3, zc),
						Point.from(Point.Type.CubicEnd, zf).mix(2 / 3, zc),
						Point.from(Point.Type.Corner, zf)
					)
				);
				z0 = zf;
				if (zfIsCorner) j++;
				break;
			}
			default: {
				newContour.push(
					TypoGeom.Arcs.Bez3.fromStraightSegment(
						new TypoGeom.Arcs.StraightSegment(z0, Point.from(Point.Type.Corner, z))
					)
				);
				z0 = z;
				break;
			}
		}
	}
	return newContour;
}

export const OCCURRENT_PRECISION = 1 / 16;
export const GEOMETRY_PRECISION = 1 / 4;
export const BOOLE_RESOLUTION = 0x4000;

export function derivativeFromFiniteDifference(c, t) {
	const DELTA = 1 / 0x10000;
	const forward2 = c.eval(t + 2 * DELTA);
	const forward1 = c.eval(t + DELTA);
	const backward1 = c.eval(t - DELTA);
	const backward2 = c.eval(t - 2 * DELTA);
	return new Vec2(
		((1 / 12) * backward2.x -
			(2 / 3) * backward1.x +
			(2 / 3) * forward1.x -
			(1 / 12) * forward2.x) /
			DELTA,
		((1 / 12) * backward2.y -
			(2 / 3) * backward1.y +
			(2 / 3) * forward1.y -
			(1 / 12) * forward2.y) /
			DELTA
	);
}

export class OffsetCurve {
	constructor(bone, offset, contrast) {
		this.bone = bone;
		this.offset = offset;
		this.contrast = contrast;
	}
	eval(t) {
		const c = this.bone.eval(t);
		const d = this.bone.derivative(t);
		const absD = Math.hypot(d.x, d.y);
		return {
			x: c.x - (d.y / absD) * this.offset * this.contrast,
			y: c.y + (d.x / absD) * this.offset
		};
	}
	derivative(t) {
		return derivativeFromFiniteDifference(this, t);
	}
}

export function convertShapeToArcs(shape) {
	return shape.map(convertContourToArcs);
}
export function shapeToRep(shape) {
	return shape.map(contourToRep);
}
export function repToShape(shapeRep) {
	return shapeRep.map(repToContour);
}

export class BezToContoursSink {
	constructor(gizmo) {
		this.gizmo = gizmo || Transform.Id();
		this.contours = [];
		this.lastContour = [];
	}
	beginShape() {}
	endShape() {
		if (this.lastContour.length) {
			this.contours.push(this.lastContour);
		}
		this.lastContour = [];
	}
	moveTo(x, y) {
		this.endShape();
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.Corner, x, y));
	}
	lineTo(x, y) {
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.Corner, x, y));
	}
	curveTo(xc, yc, x, y) {
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.Quadratic, xc, yc));
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.Corner, x, y));
	}
	cubicTo(x1, y1, x2, y2, x, y) {
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.CubicStart, x1, y1));
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.CubicEnd, x2, y2));
		this.lastContour.push(Point.transformedXY(this.gizmo, Point.Type.Corner, x, y));
	}
}

export function Bez3FromHermite(zStart, dStart, zEnd, dEnd) {
	const a = zStart,
		d = zEnd;
	const b = new Vec2(a.x + dStart.x / 3, a.y + dStart.y / 3);
	const c = new Vec2(d.x - dEnd.x / 3, d.y - dEnd.y / 3);
	return new TypoGeom.Arcs.Bez3(a, b, c, d);
}

export class RoundCapCurve {
	constructor(side, contrast, center0, point0, center1, point1) {
		this.contrast = contrast;
		this.center0 = center0;
		this.center1 = center1;

		const theta0 = Math.atan2(point0.y - center0.y, (point0.x - center0.x) / contrast);
		let theta1 = Math.atan2(point1.y - center1.y, (point1.x - center1.x) / contrast);
		if (side) {
			while (theta1 < theta0) theta1 += 2 * Math.PI;
		} else {
			while (theta1 > theta0) theta1 -= 2 * Math.PI;
		}
		this.theta0 = theta0;
		this.theta1 = theta1;

		this.r0 = Math.hypot(center0.y - point0.y, (center0.x - point0.x) / contrast);
		this.r1 = Math.hypot(center1.y - point1.y, (center1.x - point1.x) / contrast);
	}

	eval(t) {
		const centerX = mix(this.center0.x, this.center1.x, t);
		const centerY = mix(this.center0.y, this.center1.y, t);
		const r = mix(this.r0, this.r1, t);
		const theta = mix(this.theta0, this.theta1, t);

		return {
			x: centerX + r * Math.cos(theta) * this.contrast,
			y: centerY + r * Math.sin(theta)
		};
	}

	derivative(t) {
		// TODO: calculate an exact form instead of using finite difference
		return derivativeFromFiniteDifference(this, t);
	}
}
