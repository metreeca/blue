/*
 * Copyright © 2025-2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { isString, type Optional } from "@metreeca/core";
import type { Relay } from "@metreeca/core/relay";
import { type Issue, type Trace, TraceError } from "@metreeca/core/trace";
import type { Probe, Transform } from "@metreeca/qest/template";
import { describe, expect, it } from "vitest";
import { boolean } from "./boolean/index.js";
import { dictionary } from "./dictionary/index.js";
import { eager, effective, enforce, mergeShape, narrowsShape, sh, validateShape } from "./index.core.js";
import { validate } from "./index.js";
import { type Range, type Shape } from "./value/index.js";
import { byte, decimal, double, float, int, integer, long, number, short } from "./number/index.js";
import { reference } from "./reference/index.js";
import {
	id,
	multiple,
	nonempty,
	optional,
	property,
	required,
	resource,
	type ResourceShape,
	type as typed
} from "./resource/index.js";
import { date, duration, instant, string, time, timestamp, year } from "./string/index.js";
import { getShapeBranches } from "./union/accessors.js";
import { union } from "./union/index.js";


describe("eager", () => {

	describe("a stated shape", () => {

		it("resolves to itself", async () => {

			const shape = resource({});

			expect(eager(shape)).toBe(shape);

		});

		it("resolves a leaf shape to itself", async () => {

			const shape = string();

			expect(eager(shape)).toBe(shape);

		});

		it("merges what a resource inherits", async () => {

			const Base = resource({ name: required(string()) });
			const Child = resource(Base, { size: required(integer()) });

			expect(Object.keys(eager(Child).members).sort()).toEqual(["name", "size"]);

		});

	});

	describe("a deferred shape", () => {

		it("resolves to the shape it states", async () => {

			expect(eager(() => resource({})).kind).toBe("resource");

		});

		it("hands back the same shape on every reach", async () => {

			const deferred = () => resource({});

			expect(eager(deferred)).toBe(eager(deferred));

		});

		it("keeps distinct definitions apart", async () => {

			expect(eager(() => resource({}))).not.toBe(eager(() => resource({})));

		});

		it("resolves a cycle a deferred definition breaks", async () => {

			const Node: ResourceShape = resource({
				id: id(),
				next: optional(reference(() => Node))
			});

			expect(eager(() => Node)).toBe(Node);

		});

		it("reports a definition reaching itself", async () => {

			const circular = (): Shape => eager(circular);

			expect(() => eager(circular)).toThrow("circular definition");

		});

		it("leaves nothing cached where a definition throws", async () => {

			const failing = (): Shape => { throw new Error("stated wrongly"); };

			expect(() => eager(failing)).toThrow("stated wrongly");
			expect(() => eager(failing)).toThrow("stated wrongly"); // not the circularity report

		});

	});

});

describe("effective", () => {

	// the shapes a range draws its values from, a union of alternatives flattened into the branches it opens

	function branches(reached: Range | Issue): readonly Shape[] {
		return getShapeBranches(range(reached).shape);
	}

	// the range a probe reached, failing the test where it reached nothing

	function range(reached: Range | Issue): Range {

		if ( isString(reached) ) { throw new Error(`expected a range, got the issue <${reached}>`); }

		return reached;

	}

	function probe(path: readonly string[], pipe: readonly Transform[] = []): Probe {
		return { target: path[path.length-1] ?? "_", pipe, path };
	}

	// exercise a pipe against a leaf shape, wrapped in the member carrying it

	function piped(pipe: readonly Transform[], shape: Shape): Range | Issue {
		return effective(resource({ _: required(shape) }), probe(["_"], pipe));
	}


	describe("malformed probes", () => {

		it("reports a pipe naming an unknown transform", async () => {

			const bogus = { target: "_", path: ["_"], pipe: ["bogus"] } as unknown as Probe;

			expect(() => effective(resource({ _: required(integer()) }), bogus)).toThrow("malformed probe");

		});

		it("reports a probe that is not one", async () => {

			expect(() => effective(resource({ _: required(integer()) }), {} as unknown as Probe))
				.toThrow("malformed probe");

		});

	});

	describe("paths", () => {

		it("reaches the shape itself where it names no member", async () => {

			const shape = resource({ name: required(string()) });

			expect(range(effective(shape, probe([]))).shape).toBe(shape);

		});

		it("reaches the member it names", async () => {

			const shape = resource({ name: required(string()) });

			const reached = range(effective(shape, probe(["name"])));

			expect(reached.shape).toEqual(string());
			expect(reached.minCount).toBe(1);
			expect(reached.maxCount).toBe(1);

		});

		it("steps into an embedded resource", async () => {

			const shape = resource({ child: required(resource({ label: required(string()) })) });

			expect(range(effective(shape, probe(["child", "label"]))).shape).toEqual(string());

		});

		it("crosses a link to the resource it points at", async () => {

			const Inner = resource({ label: required(string()) });
			const shape = resource({ child: optional(reference(Inner)) });

			expect(range(effective(shape, probe(["child", "label"]))).shape).toEqual(string());

		});

		it("reaches a member a shape inherits", async () => {

			const Base = resource({ label: required(string()) });
			const Derived = resource(Base, { extra: required(integer()) });

			expect(range(effective(Derived, probe(["label"]))).shape).toEqual(string());

		});

		it("reports a member the shape doesn't carry", async () => {

			expect(effective(resource({ name: required(string()) }), probe(["missing"])))
				.toBe("unknown property path");

		});

		it("reports a member a nested resource doesn't carry", async () => {

			const shape = resource({ child: required(resource({ label: required(string()) })) });

			expect(effective(shape, probe(["child", "missing"]))).toBe("unknown property path");

		});

		it("reports a step past a value nothing steps past", async () => {

			expect(effective(string(), probe(["missing"]))).toBe("unknown property path");
			expect(effective(integer(), probe(["missing"]))).toBe("unknown property path");
			expect(effective(boolean(), probe(["missing"]))).toBe("unknown property path");

		});

	});

	describe("identifiers", () => {

		// the members naming and typing a resource are reached as the scalar IRI they carry

		const iri = string({ datatype: sh.IRI, pattern: /^[a-zA-Z][a-zA-Z0-9+.-]*:\S+$/ });

		it("reaches the member naming a resource", async () => {

			const shape = resource({ rid: id(), name: required(string()) });

			const reached = range(effective(shape, probe(["rid"])));

			expect(reached.shape).toEqual(iri);
			expect(reached.minCount).toBeUndefined();
			expect(reached.maxCount).toBe(1);

		});

		it("reaches the member typing a resource", async () => {

			const shape = resource({ kind: typed(), name: required(string()) }, { class: "app:/types/T" });

			expect(range(effective(shape, probe(["kind"]))).shape).toEqual(iri);

		});

		it("reaches an identifier across a link", async () => {

			const Inner = resource({ rid: id(), label: required(string()) });
			const shape = resource({ child: optional(reference(Inner)) });

			expect(range(effective(shape, probe(["child", "rid"]))).shape).toEqual(iri);

		});

		it("reports a step past the member naming a resource", async () => {

			const shape = resource({ rid: id(), name: required(string()) });

			expect(effective(shape, probe(["rid", "something"]))).toBe("unknown property path");

		});

		it("reports a step past the member typing a resource", async () => {

			const shape = resource({ kind: typed(), name: required(string()) }, { class: "app:/types/T" });

			expect(effective(shape, probe(["kind", "something"]))).toBe("unknown property path");

		});

	});

	describe("alternatives", () => {

		it("opens on every alternative where the path names no member", async () => {

			const reached = range(effective(union(string(), integer()), probe([])));

			expect(getShapeBranches(reached.shape)).toEqual([string(), integer()]);
			expect(reached.minCount).toBe(1);
			expect(reached.maxCount).toBe(1);

		});

		it("reaches the member in each alternative carrying it", async () => {

			const shape = resource({
				value: required(union(
					resource({ name: required(string()) }),
					resource({ name: required(integer()) })
				))
			});

			expect(branches(effective(shape, probe(["value", "name"])))).toHaveLength(2);
			expect(branches(effective(shape, probe(["value", "name"])))).toContainEqual(string());
			expect(branches(effective(shape, probe(["value", "name"])))).toContainEqual(integer());

		});

		it("drops an alternative lacking the member", async () => {

			const shape = resource({
				value: required(union(
					resource({ name: required(string()) }),
					resource({ age: required(integer()) })
				))
			});

			expect(range(effective(shape, probe(["value", "name"]))).shape).toEqual(string());

		});

		it("drops an alternative the path cannot step through", async () => {

			const shape = resource({
				value: required(union(
					resource({ x: required(resource({ y: required(string()) })) }),
					resource({ x: required(integer()) })
				))
			});

			expect(range(effective(shape, probe(["value", "x", "y"]))).shape).toEqual(string());

		});

		it("reaches through nested alternatives", async () => {

			const shape = resource({
				value: required(union(
					resource({
						x: required(union(
							resource({ y: required(string()) }),
							resource({ y: required(integer()) })
						))
					}),
					resource({ x: required(boolean()) })
				))
			});

			expect(branches(effective(shape, probe(["value", "x", "y"])))).toContainEqual(string());
			expect(branches(effective(shape, probe(["value", "x", "y"])))).toContainEqual(integer());

		});

		it("reports a member no alternative carries", async () => {

			const shape = resource({
				value: required(union(
					resource({ name: required(string()) }),
					resource({ age: required(integer()) })
				))
			});

			expect(effective(shape, probe(["value", "missing"]))).toBe("unknown property path");

		});

		it("reports a step past an identifier every alternative carries", async () => {

			const shape = resource({
				value: required(union(
					reference(resource({ name: id() })),
					reference(resource({ name: id() }))
				))
			});

			expect(effective(shape, probe(["value", "name", "x"]))).toBe("unknown property path");

		});

		it("reaches the navigable alternative where a sibling ends on an identifier", async () => {

			const shape = resource({
				value: required(union(
					reference(resource({ name: id() })),
					resource({ name: required(resource({ x: required(string()) })) })
				))
			});

			expect(range(effective(shape, probe(["value", "name", "x"]))).shape).toEqual(string());

		});

		it("reports the same shape once where alternatives converge on it", async () => {

			const Person = resource({ id: id(), name: required(string()) });
			const Company = resource({ id: id(), name: required(string()) });

			const shape = resource({ link: required(union(reference(Person), reference(Company))) });

			expect(range(effective(shape, probe(["link", "name"]))).shape).toEqual(string());

		});

		it("reaches a link stated as an alternative", async () => {

			const Inner = resource({ label: required(string()) });

			expect(range(effective(union(reference(Inner), integer()), probe(["label"]))).shape)
				.toEqual(string());

		});

	});

	describe("bounds", () => {

		it("carries the bounds a member states", async () => {

			expect(range(effective(resource({ v: required(string()) }), probe(["v"]))).minCount).toBe(1);
			expect(range(effective(resource({ v: required(string()) }), probe(["v"]))).maxCount).toBe(1);

			expect(range(effective(resource({ v: optional(string()) }), probe(["v"]))).minCount).toBeUndefined();
			expect(range(effective(resource({ v: optional(string()) }), probe(["v"]))).maxCount).toBe(1);

			expect(range(effective(resource({ v: nonempty(string()) }), probe(["v"]))).minCount).toBe(1);
			expect(range(effective(resource({ v: nonempty(string()) }), probe(["v"]))).maxCount).toBeUndefined();

		});

		it.each([
			["required through required", required, required, 1, 1],
			["required through optional", required, optional, undefined, 1],
			["required through nonempty", required, nonempty, 1, undefined],
			["optional through required", optional, required, undefined, 1],
			["optional through optional", optional, optional, undefined, 1],
			["optional through nonempty", optional, nonempty, undefined, undefined],
			["nonempty through required", nonempty, required, 1, undefined],
			["nonempty through optional", nonempty, optional, undefined, undefined],
			["nonempty through nonempty", nonempty, nonempty, 1, undefined]
		] as const)("accumulates %s", async (_label, outer, inner, min, max) => {

			const shape = resource({ child: outer(resource({ name: inner(string()) })) });

			const reached = range(effective(shape, probe(["child", "name"])));

			expect(reached.minCount).toBe(min);
			expect(reached.maxCount).toBe(max);

		});

		it("accumulates across every step of a path", async () => {

			const shape = resource({
				a: nonempty(resource({
					b: optional(resource({
						c: required(string())
					}))
				}))
			});

			const reached = range(effective(shape, probe(["a", "b", "c"])));

			expect(reached.minCount).toBeUndefined();
			expect(reached.maxCount).toBeUndefined();

		});

		it("keeps a member admitting nothing at zero", async () => {

			const shape = resource({ forbidden: property(string(), { minCount: 0, maxCount: 0 }) });

			const reached = range(effective(shape, probe(["forbidden"])));

			expect(reached.minCount).toBe(0);
			expect(reached.maxCount).toBe(0);

		});

		it("carries a zero bound through the rest of the path", async () => {

			const shape = resource({
				child: property(resource({ name: required(string()) }), { minCount: 0, maxCount: 0 })
			});

			const reached = range(effective(shape, probe(["child", "name"])));

			expect(reached.minCount).toBe(0);
			expect(reached.maxCount).toBe(0);

		});

		it("envelopes the lowest lower bound across alternatives", async () => {

			const shape = union(
				resource({ name: required(string()) }),
				resource({ name: optional(integer()) })
			);

			const reached = range(effective(shape, probe(["name"])));

			expect(reached.minCount).toBeUndefined();
			expect(reached.maxCount).toBe(1);

		});

		it("envelopes the highest upper bound across alternatives", async () => {

			const shape = union(
				resource({ name: required(string()) }),
				resource({ name: nonempty(integer()) })
			);

			const reached = range(effective(shape, probe(["name"])));

			expect(reached.minCount).toBe(1);
			expect(reached.maxCount).toBeUndefined();

		});

		it("envelopes across alternatives reached mid-path", async () => {

			const shape = resource({
				value: required(union(
					resource({ name: required(string()) }),
					resource({ name: optional(integer()) })
				))
			});

			const reached = range(effective(shape, probe(["value", "name"])));

			expect(reached.minCount).toBeUndefined();
			expect(reached.maxCount).toBe(1);

		});

	});

	describe("transforms", () => {

		it("carries the shape through where the pipe states no transform", async () => {

			const shape = integer();

			expect(range(piped([], shape)).shape).toBe(shape);
			expect(range(piped([], shape)).minCount).toBe(1);
			expect(range(piped([], shape)).maxCount).toBe(1);

		});

		it("counts values of any kind", async () => {

			expect(range(piped(["count"], integer())).shape).toEqual(integer());
			expect(range(piped(["count"], string())).shape).toEqual(integer());
			expect(range(piped(["count"], dictionary())).shape).toEqual(integer());
			expect(range(piped(["count"], reference(resource({ id: id() })))).shape).toEqual(integer());

		});

		it("carries a compared shape through verbatim", async () => {

			const shape = decimal();

			expect(range(piped(["min"], shape)).shape).toBe(shape);
			expect(range(piped(["max"], boolean())).shape).toEqual(boolean());
			expect(range(piped(["min"], date())).shape).toEqual(date());

		});

		it.each([
			["byte", byte()],
			["short", short()],
			["int", int()],
			["long", long()],
			["integer", integer()]
		])("widens a combined %s to the bare integral type", async (_label, shape) => {

			expect(range(piped(["sum"], shape)).shape).toEqual(integer());

		});

		it.each([
			["number", number()],
			["float", float()],
			["double", double()],
			["decimal", decimal()]
		])("widens a combined %s to the bare fractional type", async (_label, shape) => {

			expect(range(piped(["sum"], shape)).shape).toEqual(decimal());

		});

		it("yields a fractional average whatever it averages", async () => {

			expect(range(piped(["avg"], float())).shape).toEqual(decimal());
			expect(range(piped(["avg"], double())).shape).toEqual(decimal());

		});

		it("reads text as text", async () => {

			const shape = string();

			expect(range(piped(["lower"], shape)).shape).toBe(shape);
			expect(range(piped(["length"], shape)).shape).toEqual(integer());

		});

		it.each([
			["date", date()],
			["time", time()],
			["instant", instant()],
			["timestamp", timestamp()]
		])("reads a component of a %s", async (_label, shape) => {

			expect(range(piped(["year"], shape)).shape).toEqual(integer());

		});

		it.each([
			["year", year()],
			["duration", duration()]
		])("reads an opaque %s as text rather than as a point in time", async (_label, shape) => {

			expect(piped(["year"], shape)).toBe("incompatible transform input");
			expect(range(piped(["length"], shape)).shape).toEqual(integer());

		});

		it("drops a value the transform cannot act on", async () => {

			expect(piped(["min"], reference(resource({ id: id() })))).toBe("incompatible transform input");
			expect(piped(["sum"], string())).toBe("incompatible transform input");
			expect(piped(["sum"], date())).toBe("incompatible transform input");
			expect(piped(["lower"], date())).toBe("incompatible transform input");
			expect(piped(["lower"], integer())).toBe("incompatible transform input");
			expect(piped(["year"], string())).toBe("incompatible transform input");
			expect(piped(["year"], integer())).toBe("incompatible transform input");

		});

		it("applies the transforms right to left", async () => {

			expect(range(piped(["avg", "floor"], decimal())).shape).toEqual(decimal());
			expect(range(piped(["abs", "year"], date())).shape).toEqual(integer());
			expect(range(piped(["min", "floor"], decimal())).shape).toEqual(decimal());

		});

		it("drops a value a later transform cannot act on", async () => {

			expect(piped(["floor"], string())).toBe("incompatible transform input");
			expect(piped(["year", "lower"], date())).toBe("incompatible transform input");

		});

		it.each([
			["count then sum", ["count", "sum"]],
			["avg then sum", ["avg", "sum"]],
			["min then max", ["min", "max"]],
			["three at once", ["count", "min", "sum"]],
			["with a transform in between", ["sum", "abs", "count"]]
		] as const)("reports a pipe combining values more than once, %s", async (_label, pipe) => {

			expect(piped([...pipe], integer())).toBe("multiple aggregate transforms");

		});

		it("reports a pipe combining values more than once ahead of anything else", async () => {

			expect(piped(["count", "sum"], string())).toBe("multiple aggregate transforms");

		});

		describe("over alternatives", () => {

			const shape = resource({ value: required(union(string(), integer())) });

			it("keeps the alternatives the transforms act on", async () => {

				expect(range(effective(shape, probe(["value"], ["length"]))).shape).toEqual(integer());

			});

			it("reports a shape the transforms fold alternatives onto once", async () => {

				expect(range(effective(shape, probe(["value"], ["count"]))).shape).toEqual(integer());

			});

			it("stands as long as one alternative survives every transform", async () => {

				expect(range(effective(shape, probe(["value"], ["count", "length"]))).shape).toEqual(integer());

				const temporal = resource({ value: required(union(string(), integer(), date())) });

				expect(range(effective(temporal, probe(["value"], ["abs", "year"]))).shape).toEqual(integer());

			});

			it("reports a pipe no alternative survives", async () => {

				expect(effective(shape, probe(["value"], ["year"]))).toBe("incompatible transform input");
				expect(effective(shape, probe(["value"], ["lower", "year"]))).toBe("incompatible transform input");

			});

		});

		describe("bounds", () => {

			it("leaves the count unstated below where a transform may drop a value", async () => {

				const reached = range(effective(resource({ v: required(integer()) }), probe(["v"], ["abs"])));

				expect(reached.minCount).toBeUndefined();
				expect(reached.maxCount).toBe(1);

			});

			it("leaves the count as it stands above", async () => {

				const reached = range(effective(resource({ v: nonempty(integer()) }), probe(["v"], ["abs"])));

				expect(reached.minCount).toBeUndefined();
				expect(reached.maxCount).toBeUndefined();

			});

			it.each([
				["count", ["count"]],
				["sum", ["sum"]]
			] as const)("floors and caps the count at one for %s, which always yields a value", async (_l, pipe) => {

				const reached = range(effective(resource({ v: nonempty(integer()) }), probe(["v"], [...pipe])));

				expect(reached.minCount).toBe(1);
				expect(reached.maxCount).toBe(1);

			});

			it.each([
				["avg", ["avg"], nonempty(integer())],
				["min", ["min"], nonempty(string())],
				["max", ["max"], nonempty(string())],
				["avg then floor", ["avg", "floor"], nonempty(decimal())]
			] as const)("caps the count at one for %s, which may yield none", async (_l, pipe, member) => {

				const reached = range(effective(resource({ v: member }), probe(["v"], [...pipe])));

				expect(reached.minCount).toBeUndefined();
				expect(reached.maxCount).toBe(1);

			});

		});

	});

	describe("localised values", () => {

		it("is reached as the structured value it is where no transform reads it", async () => {

			const shape = resource({ label: required(dictionary({ uniqueLang: true })) });

			expect(eager(range(effective(shape, probe(["label"]))).shape).kind).toBe("dictionary");

		});

		it("is read as text where a transform reads it", async () => {

			const shape = dictionary({ uniqueLang: true });

			expect(range(piped(["lower"], shape)).shape).toEqual(string());
			expect(range(piped(["upper"], shape)).shape).toEqual(string());
			expect(range(piped(["min"], shape)).shape).toEqual(string());
			expect(range(piped(["length"], shape)).shape).toEqual(integer());

		});

		it("is read as text whatever the tags carry", async () => {

			expect(range(piped(["lower"], dictionary())).shape).toEqual(string());

		});

		it("drops a transform text cannot be read through", async () => {

			const shape = dictionary({ uniqueLang: true });

			expect(piped(["year"], shape)).toBe("incompatible transform input");
			expect(piped(["abs"], shape)).toBe("incompatible transform input");
			expect(piped(["sum"], shape)).toBe("incompatible transform input");

		});

		it("contributes an alternative to a path reaching it beside other values", async () => {

			const shape = resource({
				value: required(union(
					resource({ label: required(dictionary({ uniqueLang: true })) }),
					resource({ label: required(integer()) })
				))
			});

			const reached = branches(effective(shape, probe(["value", "label"])));

			expect(reached).toHaveLength(2);
			expect(reached.map(branch => branch.kind)).toContain("dictionary");
			expect(reached).toContainEqual(integer());

		});

		describe("bounds", () => {

			// bounds count the maps a member admits, the tags within one being a matter for the shape itself

			const Item = resource({
				label: required(dictionary({ uniqueLang: true })),
				labels: nonempty(dictionary())
			});

			const Wrapper = resource({ items: multiple(reference(Item)) });

			it("counts a single map as one value", async () => {

				expect(range(effective(Item, probe(["label"]))).maxCount).toBe(1);

			});

			it("multiplies through a multi-valued step", async () => {

				expect(range(effective(Wrapper, probe(["items", "label"]))).maxCount).toBeUndefined();
				expect(range(effective(Wrapper, probe(["items", "labels"]))).maxCount).toBeUndefined();

			});

			it("reads the text of a map reached through a multi-valued step", async () => {

				const reached = range(effective(Wrapper, probe(["items", "label"], ["lower"])));

				expect(reached.shape).toEqual(string());
				expect(reached.maxCount).toBeUndefined();

			});

			it("caps the count at one where a transform combines the text read", async () => {

				const reached = range(effective(resource({ labels: nonempty(dictionary()) }), probe(["labels"], ["min"])));

				expect(reached.shape).toEqual(string());
				expect(reached.maxCount).toBe(1);

			});

		});

	});

	describe("links", () => {

		const Inner = resource({ label: optional(string()), value: required(integer()) });

		it("opens on the resource it points at", async () => {

			expect(range(effective(reference(Inner), probe([]))).shape).toBe(Inner);

		});

		it("reaches the members of the resource it points at", async () => {

			const reached = range(effective(reference(Inner), probe(["label"])));

			expect(reached.shape).toEqual(string());
			expect(reached.minCount).toBeUndefined();
			expect(reached.maxCount).toBe(1);

		});

		it("applies the pipe to what the target reaches", async () => {

			expect(range(effective(reference(Inner), probe(["value"], ["abs"]))).shape).toEqual(integer());

		});

		it("reports a member the target doesn't carry", async () => {

			expect(effective(reference(Inner), probe(["missing"]))).toBe("unknown property path");

		});

	});

	describe("leaf shapes", () => {

		it.each([
			["boolean", boolean()],
			["number", integer()],
			["string", string()],
			["dictionary", dictionary()]
		])("is reached as itself where the path names no member, %s", async (_label, shape) => {

			expect(range(effective(shape, probe([]))).shape).toBe(shape);

		});

		it("applies the pipe to the shape itself", async () => {

			expect(range(effective(decimal(), probe([], ["floor"]))).shape).toEqual(decimal());
			expect(range(effective(decimal(), probe([], ["avg", "floor"]))).shape).toEqual(decimal());

		});

		it("counts the shape itself", async () => {

			const reached = range(effective(integer(), probe([], ["count"])));

			expect(reached.shape).toEqual(integer());
			expect(reached.minCount).toBe(1);
			expect(reached.maxCount).toBe(1);

		});

		it("reports a pipe the shape cannot be read through", async () => {

			expect(effective(string(), probe([], ["floor"]))).toBe("incompatible transform input");

		});

	});

	describe("ranges", () => {

		it("carries a range through where the probe reaches nothing further", async () => {

			const reached = range(effective({ minCount: 2, maxCount: 5, shape: integer() }, probe([])));

			expect(reached.shape).toEqual(integer());
			expect(reached.minCount).toBe(2);
			expect(reached.maxCount).toBe(5);

		});

		it("opens on every alternative a range admits", async () => {

			const reached = range(effective({
				minCount: undefined,
				maxCount: undefined,
				shape: union(integer(), string())
			}, probe([])));

			expect(getShapeBranches(reached.shape)).toEqual([integer(), string()]);
			expect(reached.minCount).toBeUndefined();
			expect(reached.maxCount).toBeUndefined();

		});

		it("multiplies the bounds it carries through a step", async () => {

			const reached = range(effective({
				minCount: 2,
				maxCount: 3,
				shape: resource({ name: required(string()) })
			}, probe(["name"])));

			expect(reached.shape).toEqual(string());
			expect(reached.minCount).toBe(2);
			expect(reached.maxCount).toBe(3);

		});

		it("applies the pipe to what it admits", async () => {

			const reached = range(effective({ minCount: 1, maxCount: 1, shape: decimal() }, probe([], ["floor"])));

			expect(reached.shape).toEqual(decimal());

		});

	});

});

describe("narrowsShape", () => {

	it("routes a pair to the operators of the kind they share", async () => {

		expect(narrowsShape(string({ minLength: 5 }), string())).toBeUndefined();
		expect(narrowsShape(integer({ minInclusive: 0 }), integer())).toBeUndefined();
		expect(narrowsShape(boolean(), boolean())).toBeUndefined();
		expect(narrowsShape(dictionary({ uniqueLang: true }), dictionary())).toBeUndefined();

	});

	it("reports a pair of unshared kinds", async () => {

		expect(narrowsShape(string(), boolean()))
			.toContainEqual(expect.stringContaining("{kind}"));

	});

	it("reports a shape loosening what the inherited one states", async () => {

		expect(narrowsShape(string({ minLength: 1 }), string({ minLength: 5 }))).toBeDefined();

	});

	describe("over a polymorphic inherited shape", () => {

		const inherited = union(string(), integer());

		it("accepts a polymorphic shape dropping an alternative", async () => {

			expect(narrowsShape(union(integer()), inherited)).toBeUndefined();

		});

		it("accepts a plain shape restricting a single alternative", async () => {

			expect(narrowsShape(integer(), inherited)).toBeUndefined();
			expect(narrowsShape(integer({ minInclusive: 0 }), inherited)).toBeUndefined();

		});

		it("reports a plain shape restricting no alternative", async () => {

			expect(narrowsShape(boolean(), inherited))
				.toContainEqual(expect.stringContaining("{branches}"));

		});

		it("reports a plain shape restricting several alternatives", async () => {

			const ambiguous = union(string({ minLength: 1 }), string({ maxLength: 5 }));

			expect(narrowsShape(string({ minLength: 2, maxLength: 4 }), ambiguous))
				.toContainEqual(expect.stringContaining("{branches}"));

		});

		it("reports a polymorphic shape over a plain inherited one", async () => {

			expect(narrowsShape(union(string()), string())).toBeDefined();

		});

	});

});

describe("mergeShape", () => {

	it("routes a pair to the operators of the kind they share", async () => {

		expect(eager(mergeShape(string({ minLength: 5 }), string()))).toMatchObject({
			kind: "string",
			minLength: 5
		});

		expect(eager(mergeShape(integer({ minInclusive: 0 }), integer()))).toMatchObject({
			kind: "number",
			minInclusive: 0
		});

	});

	it("collapses a polymorphic inherited shape to the alternative restricting it", async () => {

		const merged = eager(mergeShape(integer({ minInclusive: 0 }), union(string(), integer())));

		expect(merged).toMatchObject({ kind: "number", minInclusive: 0 });

	});

	it("merges the restricted alternative rather than replacing it", async () => {

		const merged = eager(mergeShape(integer({ minInclusive: 0 }), union(string(), integer({ maxInclusive: 9 }))));

		expect(merged).toMatchObject({ kind: "number", minInclusive: 0, maxInclusive: 9 });

	});

	it("throws where the shape doesn't narrow the inherited one", async () => {

		expect(() => mergeShape(string(), boolean())).toThrow(TraceError);
		expect(() => mergeShape(boolean(), union(string(), integer()))).toThrow(TraceError);

	});

});

describe("validateShape", () => {

	it("routes values to the validators of the shape's kind", async () => {

		expect(validateShape(["Widget"], string())).toBeUndefined();
		expect(validateShape([42], integer())).toBeUndefined();
		expect(validateShape([true], boolean())).toBeUndefined();
		expect(validateShape([{ en: ["Widget"] }], dictionary())).toBeUndefined();
		expect(validateShape(["app:/vendors/1"], reference(resource({ id: id() })))).toBeUndefined();

	});

	it("reports a value of another kind", async () => {

		expect(validateShape([42], string())).toBeDefined();
		expect(validateShape(["Widget"], integer())).toBeDefined();

	});

	it("routes a polymorphic shape to the branch the value belongs to", async () => {

		const shape = union(string(), integer());

		expect(validateShape([42], shape)).toBeUndefined();
		expect(validateShape([true], shape)).toBeDefined();

	});

	it("routes a resource shape to the members it declares", async () => {

		const shape = resource({ name: required(string()) });

		expect(validateShape([{ name: "Widget" }], shape)).toBeUndefined();
		expect(validateShape([{ name: 42 }], shape)).toBeDefined();

	});

	it("carries the scope through to the validator it routes to", async () => {

		const shape = integer({ minInclusive: 10 });

		expect(validateShape([0], shape)).toBeDefined();
		expect(validateShape([0], shape, { scope: "model" })).toBeUndefined();

	});

	it("validates every value it is given", async () => {

		expect(validateShape(["Widget", "Gadget"], string())).toBeUndefined();
		expect(validateShape(["Widget", 42], string())).toBeDefined();
		expect(validateShape([], string())).toBeUndefined();

	});

});

describe("enforce", () => {

	const limit = 100;

	const Vendor = resource({ id: id(), name: required(string()), tags: multiple(string()) });

	const Product = resource({
		name: required(string()),
		size: optional(integer()),
		tags: multiple(string()),
		label: optional(dictionary({ uniqueLang: true })),
		vendor: optional(reference(Vendor)),
		vendors: multiple(reference(Vendor))
	});

	it("leaves the template alone where no page is served", async () => {

		expect(enforce({ tags: [""] }, Product)).toEqual({ tags: [""] });
		expect(enforce({ tags: [""] }, Product, { limit: 0 })).toEqual({ tags: [""] });

	});

	it("leaves a malformed template alone", async () => {

		expect(enforce(42, Product, { limit })).toBe(42);
		expect(enforce({ unknown: "" }, Product, { limit })).toEqual({ unknown: "" });

	});

	describe("single values", () => {

		it("leaves a placeholder alone", async () => {

			expect(enforce({ name: "", size: 0 }, Product, { limit })).toEqual({ name: "", size: 0 });

		});

		it("leaves an identifier standing for a link alone", async () => {

			expect(enforce({ vendor: "app:/vendors/1" }, Product, { limit }))
				.toEqual({ vendor: "app:/vendors/1" });

		});

		it("leaves a localised value alone", async () => {

			expect(enforce({ label: { en: "" } }, Product, { limit })).toEqual({ label: { en: "" } });

		});

		it("descends into the template behind a link", async () => {

			expect(enforce({ vendor: { tags: [""] } }, Product, { limit }))
				.toEqual({ vendor: { tags: ["", { "#": limit }] } });

		});

	});

	describe("collections", () => {

		it("pages a collection of placeholders", async () => {

			expect(enforce({ tags: [""] }, Product, { limit })).toEqual({ tags: ["", { "#": limit }] });

		});

		it("pages a collection of templates", async () => {

			expect(enforce({ vendors: [{ name: "" }] }, Product, { limit }))
				.toEqual({ vendors: [{ name: "" }, { "#": limit }] });

		});

		it("leaves a page the client stated alone", async () => {

			expect(enforce({ tags: ["", { "#": 25 }] }, Product, { limit }))
				.toEqual({ tags: ["", { "#": 25 }] });

		});

		it("keeps the rest of a selection the client stated", async () => {

			expect(enforce({ tags: ["", { "~": "wid" }] }, Product, { limit }))
				.toEqual({ tags: ["", { "~": "wid", "#": limit }] });

		});

		it("pages a collection nested within a paged one", async () => {

			expect(enforce({ vendors: [{ tags: [""] }, { "#": 25 }] }, Product, { limit }))
				.toEqual({ vendors: [{ tags: ["", { "#": limit }] }, { "#": 25 }] });

		});

		it("leaves a localised member alone however many maps it admits", async () => {

			const shape = resource({ labels: multiple(dictionary({ uniqueLang: true })) });

			expect(enforce({ labels: { en: "" } }, shape, { limit })).toEqual({ labels: { en: "" } });

		});

	});

	describe("polymorphic members", () => {

		const A = resource({ name: required(string()) });
		const B = resource({ tags: multiple(string()) });

		const shape = resource({
			value: optional(union(A, B)),
			values: multiple(union(A, B))
		});

		it("descends into each branch of a single value", async () => {

			expect(enforce({ value: { "0": { name: "" }, "1": { tags: [""] } } }, shape, { limit }))
				.toEqual({ value: { "0": { name: "" }, "1": { tags: ["", { "#": limit }] } } });

		});

		it("pages a collection stated as a branch map", async () => {

			expect(enforce({ values: [{ "1": { tags: [""] } }] }, shape, { limit }))
				.toEqual({ values: [{ "1": { tags: ["", { "#": limit }] } }, { "#": limit }] });

		});

		it("leaves a branch the union doesn't declare alone", async () => {

			expect(enforce({ value: { "7": { name: "" } } }, shape, { limit }))
				.toEqual({ value: { "7": { name: "" } } });

		});

	});

	describe("projections", () => {

		it("pages a collection asked for under a column", async () => {

			expect(enforce({ vendors: [{ "t=tags": [""] }] }, Product, { limit }))
				.toEqual({ vendors: [{ "t=tags": ["", { "#": limit }] }, { "#": limit }] });

		});

	});

});

describe("validate", () => {

	// the value where it passed, or undefined where it didn't

	function value(relay: Relay<{ readonly value: unknown, readonly trace: Optional<Trace> }>): unknown {
		return relay({ value: value => value, trace: () => undefined });
	}

	// the trace where it didn't pass, or undefined where it did

	function trace(relay: Relay<{ readonly value: unknown, readonly trace: Optional<Trace> }>): Optional<Trace> {
		return relay({ value: () => undefined, trace: trace => trace });
	}


	const Vendor = resource({ id: id(), name: required(string()) });

	const Product = resource({
		id: id(),
		name: required(string()),
		size: optional(integer()),
		tags: multiple(string()),
		vendor: optional(reference(Vendor))
	});


	describe("a resource in its own right", () => {

		it("hands back the resource it admits", async () => {

			expect(value(validate({ id: "app:/products/1", name: "Widget" }, { shape: Product })))
				.toEqual({ id: "app:/products/1", name: "Widget" });

		});

		it("reports what a resource states wrongly", async () => {

			expect(trace(validate({ name: 42 }, { shape: Product }))).toBeDefined();

		});

		it("reports a member the shape doesn't declare", async () => {

			expect(trace(validate({ name: "Widget", unknown: "x" }, { shape: Product }))).toBeDefined();

		});

		it("reports a member the shape requires and the resource leaves out", async () => {

			expect(trace(validate({ id: "app:/products/1" }, { shape: Product }))).toBeDefined();

		});

		it("reports a value that is not a resource at all", async () => {

			expect(trace(validate("Widget", { shape: Product }))).toBeDefined();
			expect(trace(validate([{ name: "Widget" }], { shape: Product }))).toBeDefined();

		});

		it("holds the resource to the identifier it is expected to be named by", async () => {

			const stated = { id: "app:/products/1", name: "Widget" };

			expect(value(validate(stated, { shape: Product, entry: "app:/products/1" }))).toEqual(stated);
			expect(trace(validate(stated, { shape: Product, entry: "app:/products/2" }))).toBeDefined();

		});

		it("hands back a resource that cannot be written through", async () => {

			// ;(cast) the relay hands back an unknown, which this test writes through on purpose

			const validated = value(validate({ name: "Widget" }, { shape: Product })) as Record<string, unknown>;

			expect(() => { validated["name"] = "Gadget"; }).toThrow();

		});

		it("resolves a shape deferred to break a definition cycle", async () => {

			expect(value(validate({ name: "Widget" }, { shape: () => Product }))).toEqual({ name: "Widget" });

		});

		it("settles a second validation on the same terms off the first", async () => {

			const validated = value(validate({ name: "Widget" }, { shape: Product }));

			expect(value(validate(validated, { shape: Product }))).toBe(validated);

		});

		it("validates again where the terms tightened", async () => {

			const validated = value(validate({ vendor: "app:/vendors/1", name: "Widget" }, { shape: Product }));

			expect(value(validate(validated, { shape: Product, entry: "app:/products/1" }))).not.toBe(validated);

		});

	});

	describe("arbitrary input", () => {

		const shape = resource({ name: optional(string()), size: optional(integer()), tags: multiple(string()) });

		it.each<[string, unknown]>([
			["a date", new Date()],
			["a pattern", /pattern/],
			["a map", new Map()],
			["a set", new Set()],
			["an error", new Error("boom")],
			["an object of no prototype", Object.create(null)],
			["an instance of a class", new (class { name = "Widget"; })()]
		])("refuses %s in place of a resource", async (_label, stated) => {

			expect(trace(validate(stated, { shape }))).toBeDefined();
			expect(trace(validate(stated, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, unknown]>([
			["nothing at all", null],
			["nothing stated", undefined],
			["a string", "Widget"],
			["a number", 42],
			["a boolean", true],
			["a set of resources", [{ name: "Widget" }]],
			["a function", () => undefined],
			["a symbol", Symbol("Widget")],
			["a big integer", BigInt(1)]
		])("refuses %s in place of a resource", async (_label, stated) => {

			expect(trace(validate(stated, { shape }))).toBeDefined();
			expect(trace(validate(stated, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, string]>([
			["a hyphen", "foo-bar"],
			["a dot", "foo.bar"],
			["a keyword", "@id"],
			["a prefix", "ns:prop"],
			["digits alone", "123"]
		])("refuses a member name carrying %s", async (_label, name) => {

			expect(trace(validate({ [name]: "Widget" }, { shape }))).toBeDefined();
			expect(trace(validate({ [name]: "" }, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, unknown]>([
			["a function", () => undefined],
			["a symbol", Symbol("Widget")],
			["a big integer", BigInt(1)],
			["a date", new Date()],
			["a pattern", /pattern/],
			["a map", new Map()]
		])("refuses %s stated under a member", async (_label, stated) => {

			expect(trace(validate({ name: stated }, { shape }))).toBeDefined();
			expect(trace(validate({ name: stated }, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, number]>([
			["not a number at all", Number.NaN],
			["beyond counting", Number.POSITIVE_INFINITY],
			["below counting", Number.NEGATIVE_INFINITY]
		])("refuses a number %s", async (_label, stated) => {

			expect(trace(validate({ size: stated }, { shape }))).toBeDefined();
			expect(trace(validate({ size: stated }, { shape, model: true }))).toBeDefined();

		});

		it.each<[string, unknown]>([
			["nothing at all", null],
			["nothing stated", undefined],
			["a date", new Date()],
			["not a number at all", Number.NaN]
		])("refuses %s within a set", async (_label, stated) => {

			expect(trace(validate({ tags: [stated] }, { shape }))).toBeDefined();

		});

		it("refuses what a nested slot states wrongly", async () => {

			const Inner = resource({ label: optional(string()) });
			const nested = resource({ child: optional(reference(Inner)) });

			expect(trace(validate({ child: { "bad-key": "x" } }, { shape: nested, model: true }))).toBeDefined();
			expect(trace(validate({ child: new Date() }, { shape: nested }))).toBeDefined();

		});

		it("admits a resource parsed straight out of JSON", async () => {

			const stated = JSON.stringify({ name: "Widget", size: 30, tags: ["a", "b"] });

			expect(value(validate(JSON.parse(stated), { shape })))
				.toEqual({ name: "Widget", size: 30, tags: ["a", "b"] });

		});

		describe("prototype pollution", () => {

			it("refuses a member the shape doesn't declare, however it was stated", async () => {

				// JSON.parse states __proto__ as a member of its own rather than as the prototype, so it is read
				// like any other member and refused by the closed shape

				expect(trace(validate(JSON.parse("{\"__proto__\": \"value\"}"), { shape }))).toBeDefined();

			});

			it("refuses a resource stating through a prototype rather than in its own right", async () => {

				const inherited: Record<string, unknown> = Object.create({ name: "inherited" });

				inherited["name"] = "own";

				expect(trace(validate(inherited, { shape }))).toBeDefined();

			});

		});

	});

	describe("a retrieval", () => {

		it("hands back the resource the template asked for", async () => {

			const retrieved = { id: "app:/products/1", name: "Widget" };

			expect(value(validate(retrieved, { shape: Product, model: { id: "", name: "" } })))
				.toEqual(retrieved);

		});

		it("leaves a member the template didn't ask for unchecked", async () => {

			expect(value(validate({ id: "app:/products/1" }, { shape: Product, model: { id: "" } })))
				.toEqual({ id: "app:/products/1" });

		});

		it("reports a member the template didn't ask for", async () => {

			expect(trace(validate({ id: "app:/products/1", name: "Widget" }, {
				shape: Product,
				model: { id: "" }
			}))).toBeDefined();

		});

		it("holds a member the template asked for to the shape", async () => {

			expect(trace(validate({ name: 42 }, { shape: Product, model: { name: "" } }))).toBeDefined();

		});

		it("holds the resource to the identifier it is expected to be named by", async () => {

			const retrieved = { id: "app:/products/1" };

			expect(trace(validate(retrieved, {
				shape: Product,
				model: { id: "" },
				entry: "app:/products/2"
			}))).toBeDefined();

		});

		it("leaves a member the shape requires and the template didn't ask for unchecked", async () => {

			const shape = resource({ name: required(string()), size: required(integer()) });

			expect(value(validate({ size: 42 }, { shape, model: { size: 0 } })))
				.toEqual({ size: 42 });

		});

		it("leaves several such members unchecked at once", async () => {

			const shape = resource({
				a: required(string()),
				b: required(string()),
				c: required(integer())
			});

			expect(value(validate({ c: 42 }, { shape, model: { c: 0 } })))
				.toEqual({ c: 42 });

		});

		it("admits a link brought back as the identifier naming it", async () => {

			const retrieved = { vendor: "app:/vendors/1" };

			expect(value(validate(retrieved, { shape: Product, model: { vendor: "" } })))
				.toEqual(retrieved);

		});

		it("admits a link brought back as the resource behind it", async () => {

			const retrieved = { vendor: { id: "app:/vendors/1", name: "Acme" } };

			expect(value(validate(retrieved, { shape: Product, model: { vendor: { id: "", name: "" } } })))
				.toEqual(retrieved);

		});

		it("holds the resource behind a link to what the nested template asked for", async () => {

			expect(trace(validate({ vendor: { id: "app:/vendors/1", name: "Acme" } }, {
				shape: Product,
				model: { vendor: { id: "" } }
			}))).toBeDefined();

		});

		it("holds the resource behind a link to the shape of its target", async () => {

			expect(trace(validate({ vendor: { name: 42 } }, {
				shape: Product,
				model: { vendor: { name: "" } }
			}))).toBeDefined();

		});

		it("hands back a resource that cannot be written through", async () => {

			// ;(cast) the relay hands back an unknown, which this test writes through on purpose

			const validated = value(validate({ name: "Widget" }, {
				shape: Product,
				model: { name: "" }
			})) as Record<string, unknown>;

			expect(() => { validated["name"] = "Gadget"; }).toThrow();

		});

		it("settles a second validation on the same template off the first", async () => {

			const validated = value(validate({ name: "Widget" }, { shape: Product, model: { name: "" } }));

			expect(value(validate(validated, { shape: Product, model: { name: "" } }))).toBe(validated);

		});

		it("validates again where another template is asked about", async () => {

			const validated = value(validate({ name: "Widget" }, { shape: Product, model: { name: "" } }));

			expect(trace(validate(validated, { shape: Product, model: { size: 0 } }))).toBeDefined();

		});

	});

	describe("the page a retrieval template is held to", () => {

		it("holds every collection a template asks for to the page served", async () => {

			const Inner = resource({ id: id(), tags: multiple(string()) });
			const shape = resource({ items: multiple(reference(Inner)) });

			expect(value(validate({ items: [{ tags: [""] }] }, { shape, model: true, limit: 10 })))
				.toEqual({ items: [{ tags: ["", { "#": 10 }] }, { "#": 10 }] });

		});

		it("holds a collection stated as a branch map to the page served", async () => {

			const A = resource({ id: id(), name: required(string()) });
			const B = resource({ id: id(), tags: multiple(string()) });
			const shape = resource({ items: multiple(union(A, B)) });

			expect(value(validate({ items: [{ "1": { tags: [""] } }] }, { shape, model: true, limit: 10 })))
				.toEqual({ items: [{ "1": { tags: ["", { "#": 10 }] } }, { "#": 10 }] });

		});

		it("holds a collection asked for as a table to the page served", async () => {

			const shape = resource({ items: multiple(reference(Product)) });

			expect(value(validate({ items: [{ "n=name": "" }] }, { shape, model: true, limit: 10 })))
				.toEqual({ items: [{ "n=name": "" }, { "#": 10 }] });

		});

		it("leaves a single value alone, which nothing pages", async () => {

			expect(value(validate({ name: "", vendor: { name: "" } }, { shape: Product, model: true, limit: 10 })))
				.toEqual({ name: "", vendor: { name: "" } });

		});

		it("leaves a localised value alone, which nothing pages", async () => {

			const shape = resource({ label: optional(dictionary({ uniqueLang: true })) });

			expect(value(validate({ label: { en: "" } }, { shape, model: true, limit: 10 })))
				.toEqual({ label: { en: "" } });

		});

		it("leaves the template alone where the page is left to the caller", async () => {

			expect(value(validate({ tags: [""] }, { shape: Product, model: true, limit: 0 })))
				.toEqual({ tags: [""] });

		});

	});

	describe("a retrieval template", () => {

		it("hands back the template the shape can serve", async () => {

			expect(value(validate({ id: "", name: "" }, { shape: Product, model: true })))
				.toEqual({ id: "", name: "" });

		});

		it("reports a slot naming a member the shape doesn't declare", async () => {

			expect(trace(validate({ unknown: "" }, { shape: Product, model: true }))).toBeDefined();

		});

		it("leaves the value domain alone, a placeholder standing for a value", async () => {

			const shape = resource({ size: optional(integer({ minInclusive: 10 })) });

			expect(value(validate({ size: 0 }, { shape, model: true }))).toEqual({ size: 0 });

		});

		it("refuses the transforms combining values where asked to", async () => {

			const shape = resource({ items: multiple(reference(Product)) });
			const template = { items: [{ "n=count:name": 0 }] };

			expect(value(validate(template, { shape, model: true }))).toBeDefined();
			expect(trace(validate(template, { shape, model: true, plain: true }))).toBeDefined();

		});

		it("caps the nesting a template may ask for", async () => {

			expect(value(validate({ vendor: "app:/vendors/1" }, { shape: Product, model: true, depth: 0 })))
				.toEqual({ vendor: "app:/vendors/1" });

			expect(trace(validate({ vendor: { name: "" } }, { shape: Product, model: true, depth: 0 })))
				.toBeDefined();

		});

		it("refuses a page larger than the one served", async () => {

			expect(trace(validate({ tags: ["", { "#": 100 }] }, { shape: Product, model: true, limit: 10 })))
				.toBeDefined();

		});

		it("holds a collection asking for no page to the one served", async () => {

			expect(value(validate({ tags: [""] }, { shape: Product, model: true, limit: 10 })))
				.toEqual({ tags: ["", { "#": 10 }] });

		});

		it("leaves a page the template asked for alone", async () => {

			expect(value(validate({ tags: ["", { "#": 5 }] }, { shape: Product, model: true, limit: 10 })))
				.toEqual({ tags: ["", { "#": 5 }] });

		});

		it("hands back a template that cannot be written through", async () => {

			// ;(cast) the relay hands back an unknown, which this test writes through on purpose

			const validated = value(validate({ name: "" }, { shape: Product, model: true })) as Record<string, unknown>;

			expect(() => { validated["name"] = [true]; }).toThrow();

		});

		it("hands back a template stated apart from the one it was given", async () => {

			const stated = { name: "" };

			expect(value(validate(stated, { shape: Product, model: true }))).not.toBe(stated);
			expect(value(validate(stated, { shape: Product, model: true }))).toEqual(stated);

		});

		it("settles a second validation on the same terms off the first", async () => {

			const validated = value(validate({ name: "" }, { shape: Product, model: true }));

			expect(value(validate(validated, { shape: Product, model: true }))).toBe(validated);

		});

		it("settles a second validation where the page served loosened", async () => {

			const validated = value(validate({ tags: [""] }, { shape: Product, model: true, limit: 10 }));

			expect(value(validate(validated, { shape: Product, model: true, limit: 100 }))).toBe(validated);

		});

		it("validates again where the page served tightened", async () => {

			const validated = value(validate({ tags: [""] }, { shape: Product, model: true, limit: 100 }));

			expect(trace(validate(validated, { shape: Product, model: true, limit: 10 }))).toBeDefined();

		});

		it("validates again where the nesting allowed tightened", async () => {

			const validated = value(validate({ vendor: { name: "" } }, { shape: Product, model: true, depth: 1 }));

			expect(trace(validate(validated, { shape: Product, model: true, depth: 0 }))).toBeDefined();

		});

		it("validates again where the terms tightened", async () => {

			const validated = value(validate({ name: "" }, { shape: Product, model: true }));

			expect(value(validate(validated, { shape: Product, model: true, plain: true }))).not.toBe(validated);

		});

		it("tells a template apart from a resource on the same shape", async () => {

			// a nested template stands for the resource behind a link, which the link itself never admits

			const validated = value(validate({ vendor: { name: "" } }, { shape: Product, model: true }));

			expect(validated).toEqual({ vendor: { name: "" } });
			expect(trace(validate(validated, { shape: Product }))).toBeDefined();

		});

	});

});
