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
import { type Instance } from "../value/index.js";
import { reference, type ReferenceShape } from "./index.js";
import { id, resource } from "../resource/index.js";


describe("reference", () => {

	test("reference → a ReferenceShape carrying its target", () => {
		const target=resource({ id: id() });

		expectTypeOf(reference(target)).toEqualTypeOf<ReferenceShape<typeof target>>();
	});

	test("ReferenceShape → an IRI", () => {
		expectTypeOf<Instance<ReferenceShape>>().toEqualTypeOf<Reference>();
	});

});
