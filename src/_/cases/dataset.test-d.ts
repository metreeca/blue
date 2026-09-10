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
import type { State } from "../_.js";
import { Dataset, Resource } from "./dataset.js";


describe("dataset", () => {

	// Dataset extends Resource, whose `dataset` property references Dataset back: the reference arm cuts the loop,
	// since it contributes the target IRI rather than the target state

	test("resolves the state of a shape looping through a reference", () => {

		expectTypeOf<State<ReturnType<typeof Resource>>>().toEqualTypeOf<{

			readonly id: Reference,
			readonly label: string,
			readonly comment: undefined | string,

			readonly generated: undefined | boolean,
			readonly dataset: Reference

		}>();

	});

	test("resolves the state of the shape it loops back to", () => {

		expectTypeOf<State<ReturnType<typeof Dataset>>>().toEqualTypeOf<{

			readonly id: Reference,
			readonly label: string,
			readonly comment: undefined | string,

			readonly generated: undefined | boolean,
			readonly dataset: Reference,

			readonly title: string,
			readonly alternative: undefined | string,
			readonly description: string,
			readonly resources: undefined | readonly Reference[]

		}>();

	});

});
