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
 * Static type tests for {@link NumberShape} factory constraints.
 *
 * Verifies compile-time enforcement of non-empty array constraints.
 *
 * @module
 */

import { describe, test } from "vitest";
import { number } from "./number.js";


describe("NumberShape", () => {

	describe("in", () => {

		test("accepts non-empty array", () => {
			number({ in: [1, 2, 3] });
		});

		test("accepts single-element array", () => {
			number({ in: [42] });
		});

		test("accepts empty array (ignored)", () => {
			number({ in: [] });
		});

	});

	describe("hasValue", () => {

		test("accepts non-empty array", () => {
			number({ hasValue: [1, 2] });
		});

		test("accepts single-element array", () => {
			number({ hasValue: [0] });
		});

		test("accepts empty array (ignored)", () => {
			number({ hasValue: [] });
		});

	});

});
