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
 * Static type tests for {@link LocalisedShape} factory and cardinality overloads.
 *
 * Verifies compile-time enforcement of non-empty array constraints and
 * per-tag cardinality type projections.
 *
 * @module
 */

import { asTagRange } from "@metreeca/core/language";
import { describe, expectTypeOf, test } from "vitest";
import { localised, type LocalisedShape } from "./localised.js";
import { multiple, optional, repeatable, required } from "./value.js";


describe("LocalisedShape", () => {

	describe("languageIn", () => {

		test("accepts non-empty array", () => {
			localised({ languageIn: [asTagRange("en"), asTagRange("it")] });
		});

		test("accepts single-element array", () => {
			localised({ languageIn: [asTagRange("en")] });
		});

		test("rejects empty array", () => {
			// @ts-expect-error - empty array not assignable to non-empty tuple
			localised({ languageIn: [] });
		});

	});

	describe("cardinality overloads", () => {

		test("required(localised()) projects string | { readonly [tag: string]: string } model", () => {
			expectTypeOf(required(localised()).model).toEqualTypeOf<string | { readonly [tag: string]: string }>();
		});

		test("optional(localised()) projects string | { readonly [tag: string]: string } model", () => {
			expectTypeOf(optional(localised()).model).toEqualTypeOf<string | { readonly [tag: string]: string }>();
		});

		test("multiple(localised()) projects readonly string[] | { readonly [tag: string]: readonly string[] } model", () => {
			expectTypeOf(multiple(localised()).model).toEqualTypeOf<readonly string[] | {
				readonly [tag: string]: readonly string[]
			}>();
		});

		test("repeatable(localised()) projects readonly string[] | { readonly [tag: string]: readonly string[] } model", () => {
			expectTypeOf(repeatable(localised()).model).toEqualTypeOf<readonly string[] | {
				readonly [tag: string]: readonly string[]
			}>();
		});

		test("required(localised()) model is string | { readonly [tag: string]: string }", () => {
			const shape = required(localised());
			expectTypeOf(shape.model).toEqualTypeOf<string | { readonly [tag: string]: string }>();
		});

		test("multiple(localised()) model is readonly string[] | { readonly [tag: string]: readonly string[] }", () => {
			const shape = multiple(localised());
			expectTypeOf(shape.model).toEqualTypeOf<readonly string[] | {
				readonly [tag: string]: readonly string[]
			}>();
		});

	});

});
