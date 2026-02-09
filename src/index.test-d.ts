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
 * Static type tests for {@link ValueShape} and {@link Infer} type inference.
 *
 * Verifies compile-time type inference for the value shape union and model type extraction,
 * including lazy factory unwrapping.
 *
 * @module
 */

import type { IRI } from "@metreeca/core/resource";
import type { Local, Locals, Resource } from "@metreeca/qest/state";
import { describe, expectTypeOf, test } from "vitest";
import type { BooleanShape } from "./boolean.js";
import type { Infer, ValueShape } from "./index.js";
import type { LocalShape, LocalsShape } from "./local.js";
import type { NumberShape } from "./number.js";
import type { ReferenceShape, ResourceShape } from "./resource.js";
import type { StringShape } from "./string.js";


describe("Model", () => {

	test("BooleanShape → boolean", () => {
		expectTypeOf<Infer<BooleanShape>>().toEqualTypeOf<boolean>();
	});

	test("NumberShape → number", () => {
		expectTypeOf<Infer<NumberShape>>().toEqualTypeOf<number>();
	});

	test("StringShape → string", () => {
		expectTypeOf<Infer<StringShape>>().toEqualTypeOf<string>();
	});

	test("LocalShape → Local", () => {
		expectTypeOf<Infer<LocalShape>>().toEqualTypeOf<Local>();
	});

	test("LocalsShape → Locals", () => {
		expectTypeOf<Infer<LocalsShape>>().toEqualTypeOf<Locals>();
	});

	test("ReferenceShape → Reference", () => {
		expectTypeOf<Infer<ReferenceShape>>().toEqualTypeOf<IRI>();
	});

	test("ResourceShape → Resource", () => {
		expectTypeOf<Infer<ResourceShape>>().toEqualTypeOf<Resource>();
	});

	test("ValueShape → union of all model types", () => {
		expectTypeOf<Infer<ValueShape>>()
			.toEqualTypeOf<boolean | number | string | Local | Locals | IRI | Resource>();
	});

	test("lazy factory → unwrapped model type", () => {
		expectTypeOf<Infer<() => StringShape>>().toEqualTypeOf<string>();
	});

	test("nested lazy factory → unwrapped model type", () => {
		expectTypeOf<Infer<() => NumberShape>>().toEqualTypeOf<number>();
	});

});
