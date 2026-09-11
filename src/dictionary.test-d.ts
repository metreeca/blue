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
 * Static type tests for {@link DictionaryShape} factory and cardinality overloads.
 *
 * Verifies compile-time enforcement of non-empty array constraints and
 * per-tag cardinality type projections.
 *
 * @module
 */

import { assert } from "@metreeca/core";
import { isTagRange } from "@metreeca/core/language";
import { describe, expectTypeOf, test } from "vitest";
import { dictionary, type DictionaryShape } from "./dictionary.js";
import { resource } from "./resource.js";
import { multiple, nonempty, optional, required } from "./resource.js";
import { type State } from "./value.js";


describe("DictionaryShape", () => {

	describe("languageIn", () => {

		test("accepts non-empty array", () => {
			dictionary({ languageIn: [assert("en", isTagRange), assert("it", isTagRange)] });
		});

		test("accepts single-element array", () => {
			dictionary({ languageIn: [assert("en", isTagRange)] });
		});

		test("accepts empty array (ignored)", () => {
			dictionary({ languageIn: [] });
		});

	});

	describe("cardinality overloads", () => {

		test("required(dictionary()) projects { readonly [tag: string]: string } model", () => {
			expectTypeOf(required(dictionary()).range.model).toEqualTypeOf<{ readonly [tag: string]: string }>();
		});

		test("optional(dictionary()) projects undefined | { readonly [tag: string]: string } model", () => {
			expectTypeOf(optional(dictionary()).range.model).toEqualTypeOf<
				undefined | { readonly [tag: string]: string }
			>();
		});

		test("multiple(dictionary()) projects undefined | { readonly [tag: string]: readonly [string] } model", () => {
			expectTypeOf(multiple(dictionary()).range.model).toEqualTypeOf<undefined | {
				readonly [tag: string]: readonly [string]
			}>();
		});

		test("nonempty(dictionary()) projects { readonly [tag: string]: readonly [string] } model", () => {
			expectTypeOf(nonempty(dictionary()).range.model).toEqualTypeOf<{
				readonly [tag: string]: readonly [string]
			}>();
		});

		test("required(dictionary()) model is { readonly [tag: string]: string }", () => {
			const { range } = required(dictionary());
			expectTypeOf(range.model).toEqualTypeOf<{ readonly [tag: string]: string }>();
		});

		test("multiple(dictionary()) model is undefined | { readonly [tag: string]: readonly [string] }", () => {
			const { range } = multiple(dictionary());
			expectTypeOf(range.model).toEqualTypeOf<undefined | {
				readonly [tag: string]: readonly [string]
			}>();
		});

	});

	describe("tag narrowing", () => {

		test("required(dictionary({ en: \"\" })) projects the declared tag map only (no string shorthand)", () => {
			expectTypeOf(required(dictionary({ en: "" })).range.model).toEqualTypeOf<
				{ readonly en: string }
			>();
		});

		test("multiple(dictionary({ en: \"\" })) projects the declared per-tag array map only (no string shorthand)", () => {
			expectTypeOf(multiple(dictionary({ en: "" })).range.model).toEqualTypeOf<
				undefined | { readonly en: readonly [string] }
			>();
		});

		test("dictionary() (no model) projects the open tag map only", () => {
			expectTypeOf(required(dictionary()).range.model).toEqualTypeOf<
				{ readonly [tag: string]: string }
			>();
		});

		test("dictionary() rejects bare-string shorthand", () => {
			// @ts-expect-error - bare-string model no longer accepted; tag map required
			dictionary("");
		});

		test("object literal with undeclared tag is rejected", () => {
			const { range } = required(dictionary({ en: "" }));
			type M = typeof range.model;
			// @ts-expect-error - undeclared "it" tag not assignable
			const _model: M = { en: "", it: "" };
			void _model;
		});

		test("State projection through resource projects the declared tag map only", () => {
			const shape = resource({
				name: required(dictionary({ en: "" }))
			});
			expectTypeOf<State<typeof shape>>().toEqualTypeOf<{
				readonly name: { readonly en: string }
			}>();
		});

		test("State projection rejects undeclared tags in instance literal", () => {
			const shape = resource({
				name: required(dictionary({ en: "" }))
			});
			// @ts-expect-error - undeclared "it" tag not assignable through State projection
			const _instance: State<typeof shape> = { name: { en: "", it: "" } };
			void _instance;
		});

	});

});
