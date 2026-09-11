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

/**
 * Static type tests for {@link validate} overload resolution.
 *
 * Verifies that the split shape/model overload infers the projection type `T` from `model` independently of `shape`,
 * narrowing the return `value` to `Instance<T>`.
 *
 * @module
 */

import type { Optional } from "@metreeca/core";
import type { Relay } from "@metreeca/core/relay";
import type { Trace } from "@metreeca/core/trace";
import type { Reference } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import { validate } from "./index.js";
import { integer } from "./number.js";
import { id, resource } from "./resource.js";
import { string } from "./string.js";
import { required } from "./resource.js";


describe("validate (projection) overload", () => {

	const Product = resource({
		id: id(),
		name: required(string()),
		price: required(integer())
	});

	test("infers projection type T from model, not from shape", () => {

		const model = { name: "", price: 0 };
		const relay = validate({} as unknown, { shape: Product, model });

		expectTypeOf(relay).toEqualTypeOf<Relay<{
			readonly value: { readonly name: string; readonly price: number };
			readonly trace: Optional<Trace>;
		}>>();

	});

	test("decouples T from shape's Prototype — arbitrary projection permitted", () => {

		// projection asks only for `price`; would not type-check against the bonded overload,
		// which requires T to equal the shape's full Prototype
		const model = { price: 0 };

		const relay = validate({} as unknown, { shape: Product, model });

		expectTypeOf(relay).toEqualTypeOf<Relay<{
			readonly value: { readonly price: number };
			readonly trace: Optional<Trace>;
		}>>();

	});

	test("accepts bare Lazy<ResourceShape> for shape (no bonded model required)", () => {

		// factory-form shape with no `& { model: T }` bond — must still type-check
		const model = { name: "" };

		validate({} as unknown, { shape: () => Product, model });

	});

	test("accepts optional entry alongside model", () => {

		const model = { name: "" };
		const entry: Reference = "app:/products/1";

		validate({} as unknown, { shape: Product, model, entry });

	});

	test("rejects model whose inferred T violates Template constraint", () => {

		// Template requires plain shape — a function is not a valid Template
		// @ts-expect-error — function is not assignable to Template
		validate({} as unknown, { shape: Product, model: () => 0 });

	});

});

describe("validate (template) overload", () => {

	const Product = resource({
		id: id(),
		name: required(string()),
		price: required(integer())
	});

	test("model: true selects the template overload and accepts plain/depth/limit", () => {

		validate({} as unknown, { shape: Product, model: true });
		validate({} as unknown, { shape: Product, model: true, plain: true });
		validate({} as unknown, { shape: Product, model: true, depth: 0 });
		validate({} as unknown, { shape: Product, model: true, limit: 100 });

	});

	test("rejects entry in the template overload", () => {

		// @ts-expect-error — entry is not an option of the template overload
		validate({} as unknown, { shape: Product, model: true, entry: "app:/x" });

	});

});

describe("validate (bonded instance) overload", () => {

	const Product = resource({
		id: id(),
		name: required(string()),
		price: required(integer())
	});

	test("omitted model selects the bonded instance overload", () => {

		validate({} as unknown, { shape: Product });

	});

	test("explicit model: false selects the bonded instance overload", () => {

		validate({} as unknown, { shape: Product, model: false });

	});

	test("rejects template-only options in the instance overload", () => {

		// @ts-expect-error — plain is not an option of the instance overload
		validate({} as unknown, { shape: Product, model: false, plain: true });

	});

});
