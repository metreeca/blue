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


import type { Reference } from "@metreeca/qest/resource";
import { describe, expectTypeOf, test } from "vitest";
import { type ReferenceShape } from "../reference/index.js";
import { type Id, type Property } from "../resource/index.js";
import { type StringShape } from "../string/index.js";
import { type Branch } from "./inference.js";
import { type UnionShape } from "./index.js";



type LinkShape={

	readonly kind: "resource",
	readonly classes: readonly Reference[],
	readonly parents: [],

	readonly members: {
		readonly id: Id,
		readonly label: Property<StringShape, 1, 1>
	}

}

describe("Branch", () => {

	test("union shape → the shape of every branch", () => {
		expectTypeOf<Branch<UnionShape<[StringShape, ReferenceShape]>>>().toEqualTypeOf<StringShape | ReferenceShape>();
	});

	test("lazy union → the branches of the shape it returns", () => {
		expectTypeOf<Branch<() => UnionShape<[StringShape]>>>().toEqualTypeOf<StringShape>();
	});

	test("lazy branch → the deferred shape as declared", () => {
		expectTypeOf<Branch<UnionShape<[() => LinkShape]>>>().toEqualTypeOf<() => LinkShape>();
	});

	test("non-union shape → no branch at all", () => {
		expectTypeOf<Branch<StringShape>>().toBeNever();
	});

});
