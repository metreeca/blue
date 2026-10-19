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

import { createNamespace } from "@metreeca/core/resource";
import { TraceError } from "@metreeca/core/trace";
import { expect, it } from "vitest";
import { boolean } from "../boolean/index.js";
import { dictionary } from "../dictionary/index.js";
import { integer, number } from "../number/index.js";
import { reference } from "../reference/index.js";
import { string } from "../string/index.js";
import { union } from "../union/index.js";
import {
	getShapeClass,
	getShapeClasses,
	getShapeId,
	getShapeProperties,
	getShapeType,
	getStateEntries,
	getStateId
} from "./accessors.js";
import { id, multiple, optional, required, resource, type as typed } from "./index.js";


const ex = createNamespace("https://example.com/");

const subject = "https://example.com/subject";
const target = "https://example.com/target";


const shape = resource({ id: id(), type: typed(), name: required(string()) });


it("resolves the name the identifier is stated under", async () => {

	expect(getShapeId(shape)).toBe("id");

});

it("resolves the name the class is stated under", async () => {

	expect(getShapeType(shape)).toBe("type");

});

it("resolves the members of a linked target", async () => {

	expect(Object.keys(getShapeProperties(reference(shape))).sort()).toEqual(["id", "name", "type"]);

});

it("resolves no member for a range pointing at no resource", async () => {

	expect(getShapeProperties(string())).toEqual({});

});

it("resolves the class a target belongs to", async () => {

	const Product = resource({ class: "https://schema.org/Product" }, { id: id() });

	expect(getShapeClass(reference(Product))).toBe("https://schema.org/Product");

});

it("resolves the classes a target belongs to on top of its own", async () => {

	const Thing = resource({ class: "https://schema.org/Thing" }, { id: id() });
	const Product = resource(Thing, { class: "https://schema.org/Product" }, {});

	expect(getShapeClasses(reference(Product))).toEqual(["https://schema.org/Thing"]);

});

it("resolves no class for a range pointing at no resource", async () => {

	expect(getShapeClass(string())).toBeUndefined();
	expect(getShapeClasses(string())).toBeUndefined();

});


it("retrieves the identifier the state states", async () => {

	const shape = resource({ id: id() });

	expect(getStateId(shape, { id: subject })).toBe(subject);

});

it("retrieves no identifier where the shape declares no id member", async () => {

	const shape = resource({ value: optional(string()) });

	expect(getStateId(shape, { value: "x" })).toBeUndefined();

});

it("rejects invalid states when retrieving the identifier", async () => {

	const shape = resource({ id: id(), value: optional(string()) });
	const state = { id: subject, other: "y" };

	expect(() => getStateId(shape, state)).toThrow(TraceError);

});


it.each([
	["boolean", boolean(), true],
	["number", number(), 1.5],
	["string", string(), "x"],
	["dictionary", dictionary(), { en: ["x"] }],
	["reference", reference(resource({ id: id() })), target],
	["resource", resource({ value: optional(string()) }), { value: "x" }]
])("pairs %s values with their member and value shape", async (kind, range, value) => {

	const shape = resource({ id: id(), value: required(range) });

	expect(getStateEntries(shape, { id: subject, value })).toEqual([
		expect.objectContaining({ kind, shape: range, field: "value", value })
	]);

});

it("carries the property each value is held by", async () => {

	const shape = resource({ value: optional(string(), { forward: ex.other }) });

	expect(getStateEntries(shape, { value: "x" })[0]?.property.forward).toBe(ex.other);

});

it("resolves union values to the branch they match", async () => {

	const text = string();
	const count = integer();

	const shape = resource({ value: multiple(union(text, count)) });

	expect(getStateEntries(shape, { value: ["x", 1] })).toEqual([
		expect.objectContaining({ kind: "string", shape: text, value: "x" }),
		expect.objectContaining({ kind: "number", shape: count, value: 1 })
	]);

});

it("yields one entry per value, in value order", async () => {

	const shape = resource({ value: multiple(string()) });

	expect(getStateEntries(shape, { value: ["x", "y"] }).map(entry => entry.value)).toEqual(["x", "y"]);

});

it("yields entries in member declaration order", async () => {

	const shape = resource({ a: optional(string()), b: optional(integer()) });

	expect(getStateEntries(shape, { b: 1, a: "x" }).map(entry => entry.field)).toEqual(["a", "b"]);

});

it.each([
	["absent values", {}],
	["empty value lists", { value: [] }]
])("yields nothing for %s", async (_, state) => {

	const shape = resource({ value: multiple(string()) });

	expect(getStateEntries(shape, state)).toEqual([]);

});

it("skips id and type members", async () => {

	const shape = resource({ class: ex.Kind }, { id: id(), type: typed() });

	expect(getStateEntries(shape, { id: subject, type: ex.Kind })).toEqual([]);

});

it("rejects invalid states when retrieving the values", async () => {

	const shape = resource({ value: optional(string()) });
	const state = { value: "x", other: "y" };

	expect(() => getStateEntries(shape, state)).toThrow(TraceError);

});

