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

import { expect, it } from "vitest";
import { reference } from "../reference/index.js";
import { string } from "../string/index.js";
import {
	getShapeClass,
	getShapeClasses,
	getShapeId,
	getShapeProperties,
	getShapeType
} from "./accessors.js";
import { id, required, resource, type as typed } from "./index.js";


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

	const Product = resource({ id: id() }, { class: "https://schema.org/Product" });

	expect(getShapeClass(reference(Product))).toBe("https://schema.org/Product");

});

it("resolves the classes a target belongs to on top of its own", async () => {

	const Thing = resource({ id: id() }, { class: "https://schema.org/Thing" });
	const Product = resource(Thing, {}, { class: "https://schema.org/Product" });

	expect(getShapeClasses(reference(Product))).toEqual(["https://schema.org/Thing"]);

});

it("resolves no class for a range pointing at no resource", async () => {

	expect(getShapeClass(string())).toBeUndefined();
	expect(getShapeClasses(string())).toBeUndefined();

});

