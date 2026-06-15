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
 * Static type tests for {@link TextShape} factory and cardinality overloads.
 *
 * Verifies compile-time enforcement of non-empty array constraints and
 * per-tag cardinality type projections.
 *
 * @module
 */

import { assert } from "@metreeca/core/report";
import { isTagRange } from "@metreeca/core/language";
import { describe, expectTypeOf, test } from "vitest";
import { text, type TextShape } from "./text.js";
import { resource } from "./resource.js";
import { multiple, optional, repeatable, required, type State } from "./value.js";


describe("TextShape", () => {

	describe("languageIn", () => {

		test("accepts non-empty array", () => {
			text({ languageIn: [assert("en", isTagRange), assert("it", isTagRange)] });
		});

		test("accepts single-element array", () => {
			text({ languageIn: [assert("en", isTagRange)] });
		});

		test("rejects empty array", () => {
			// @ts-expect-error - empty array not assignable to non-empty tuple
			text({ languageIn: [] });
		});

	});

	describe("cardinality overloads", () => {

		test("required(text()) projects { readonly [tag: string]: string } model", () => {
			expectTypeOf(required(text()).model).toEqualTypeOf<{ readonly [tag: string]: string }>();
		});

		test("optional(text()) projects undefined | { readonly [tag: string]: string } model", () => {
			expectTypeOf(optional(text()).model).toEqualTypeOf<
				undefined | { readonly [tag: string]: string }
			>();
		});

		test("multiple(text()) projects undefined | { readonly [tag: string]: readonly [string] } model", () => {
			expectTypeOf(multiple(text()).model).toEqualTypeOf<undefined | {
				readonly [tag: string]: readonly [string]
			}>();
		});

		test("repeatable(text()) projects { readonly [tag: string]: readonly [string] } model", () => {
			expectTypeOf(repeatable(text()).model).toEqualTypeOf<{
				readonly [tag: string]: readonly [string]
			}>();
		});

		test("required(text()) model is { readonly [tag: string]: string }", () => {
			const shape = required(text());
			expectTypeOf(shape.model).toEqualTypeOf<{ readonly [tag: string]: string }>();
		});

		test("multiple(text()) model is undefined | { readonly [tag: string]: readonly [string] }", () => {
			const shape = multiple(text());
			expectTypeOf(shape.model).toEqualTypeOf<undefined | {
				readonly [tag: string]: readonly [string]
			}>();
		});

	});

	describe("tag narrowing", () => {

		test("required(text({ en: \"\" })) projects the declared tag map only (no string shorthand)", () => {
			expectTypeOf(required(text({ en: "" })).model).toEqualTypeOf<
				{ readonly en: string }
			>();
		});

		test("multiple(text({ en: \"\" })) projects the declared per-tag array map only (no string shorthand)", () => {
			expectTypeOf(multiple(text({ en: "" })).model).toEqualTypeOf<
				undefined | { readonly en: readonly [string] }
			>();
		});

		test("text() (no model) projects the open tag map only", () => {
			expectTypeOf(required(text()).model).toEqualTypeOf<
				{ readonly [tag: string]: string }
			>();
		});

		test("text() rejects bare-string shorthand", () => {
			// @ts-expect-error - bare-string model no longer accepted; tag map required
			text("");
		});

		test("object literal with undeclared tag is rejected", () => {
			const shape = required(text({ en: "" }));
			type M = typeof shape.model;
			// @ts-expect-error - undeclared "it" tag not assignable
			const _model: M = { en: "", it: "" };
			void _model;
		});

		test("State projection through resource projects the declared tag map only", () => {
			const shape = resource({
				name: required(text({ en: "" }))
			});
			expectTypeOf<State<typeof shape>>().toEqualTypeOf<{
				readonly name: { readonly en: string }
			}>();
		});

		test("State projection rejects undeclared tags in instance literal", () => {
			const shape = resource({
				name: required(text({ en: "" }))
			});
			// @ts-expect-error - undeclared "it" tag not assignable through State projection
			const _instance: State<typeof shape> = { name: { en: "", it: "" } };
			void _instance;
		});

	});

});
