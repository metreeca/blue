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

import { describe, expectTypeOf, test } from "vitest";
import { type State } from "./_.js";
import { markdown, type StringShape, string, text } from "./string.js";


describe("string", () => {

	test("string → StringShape", () => {
		expectTypeOf(string()).toEqualTypeOf<StringShape>();
	});

	test("text → StringShape", () => {
		expectTypeOf(text()).toEqualTypeOf<StringShape>();
	});

	test("markdown → StringShape", () => {
		expectTypeOf(markdown()).toEqualTypeOf<StringShape>();
	});

	test("StringShape → string", () => {
		expectTypeOf<State<StringShape>>().toEqualTypeOf<string>();
	});

});
