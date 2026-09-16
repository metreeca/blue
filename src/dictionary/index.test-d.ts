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

import { assert } from "@metreeca/core";
import { isTagRange, type Tag } from "@metreeca/core/language";
import { describe, expectTypeOf, test } from "vitest";
import { dictionary, type DictionaryShape } from "./index.js";
import { type Compound, type Instance } from "../value/index.js";
import { multiple, optional, required, resource } from "../resource/index.js";


describe("dictionary", () => {

	test("dictionary → DictionaryShape", () => {
		expectTypeOf<typeof shape>().toExtend<DictionaryShape>();
	});

	const shape = dictionary();

	test("DictionaryShape → tag-keyed arrays", () => {
		expectTypeOf<Instance<DictionaryShape>>().toEqualTypeOf<{ readonly [tag: Tag]: readonly string[] }>();
	});

	test("unique-tagged shape → a single string per tag", () => {

		const unique = dictionary({ uniqueLang: true });

		expectTypeOf<Instance<typeof unique>>().toEqualTypeOf<{ readonly [tag: Tag]: string }>();

	});

	test("unstated arity → an array of strings per tag", () => {
		expectTypeOf<Instance<typeof shape>>().toEqualTypeOf<{ readonly [tag: Tag]: readonly string[] }>();
	});

	test("explicitly non-unique arity → an array of strings per tag", () => {

		const stacked = dictionary({ uniqueLang: false });

		expectTypeOf<Instance<typeof stacked>>().toEqualTypeOf<{ readonly [tag: Tag]: readonly string[] }>();

	});

	test("arity stated only as a boolean → an array of strings per tag", () => {

		const stated = dictionary({ uniqueLang: Boolean(1) });

		expectTypeOf<Instance<typeof stated>>().toEqualTypeOf<{ readonly [tag: Tag]: readonly string[] }>();

	});

	test("stated arity survives the other constraints", () => {

		const unique = dictionary({ uniqueLang: true, minLength: 1, languageIn: [assert("en", isTagRange)] });

		expectTypeOf<Instance<typeof unique>>().toEqualTypeOf<{ readonly [tag: Tag]: string }>();

	});

});

describe("constraints", () => {

	test("accepts a non-empty language range set", () => {
		dictionary({ languageIn: [assert("en", isTagRange), assert("it", isTagRange)] });
	});

	test("accepts a single-element language range set", () => {
		dictionary({ languageIn: [assert("en", isTagRange)] });
	});

	test("accepts an empty language range set", () => {
		dictionary({ languageIn: [] });
	});

	test("refuses a length bound stated as a string", () => {
		// @ts-expect-error - length bounds are numeric
		dictionary({ minLength: "1" });
	});

	test("refuses an unknown constraint", () => {
		// @ts-expect-error - the shape states no such constraint
		dictionary({ pattern: /^\S+$/ });
	});

});

describe("members", () => {

	const Article = resource({
		title: required(dictionary({ uniqueLang: true })),
		abstract: optional(dictionary({ uniqueLang: true })),
		keywords: multiple(dictionary())
	});

	test("carries the per-tag arity through cardinality", () => {

		expectTypeOf<Instance<typeof Article>["title"]>()
			.toEqualTypeOf<{ readonly [tag: Tag]: string }>();

		expectTypeOf<Instance<typeof Article>["abstract"]>()
			.toEqualTypeOf<undefined | { readonly [tag: Tag]: string }>();

		expectTypeOf<Instance<typeof Article>["keywords"]>()
			.toEqualTypeOf<undefined | { readonly [tag: Tag]: readonly string[] }>();

	});

	test("carries the per-tag arity into a submission", () => {
		expectTypeOf<Compound<typeof Article>["title"]>().toEqualTypeOf<{ readonly [tag: Tag]: string }>();
	});

	test("carries the per-tag arity through inheritance", () => {

		const Titled = resource(Article, { abstract: required(dictionary({ uniqueLang: true })) });

		expectTypeOf<Instance<typeof Titled>["abstract"]>().toEqualTypeOf<{ readonly [tag: Tag]: string }>();

	});

});
