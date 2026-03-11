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

import { describe, expect, it } from "vitest";
import { resource } from "../resource.js";
import { materialize } from "./cache.js";

describe("materialize", () => {

	describe("with direct values", () => {

		it("returns the value unchanged", async () => {

			const value = resource({});

			expect(materialize(value)).toBe(value);

		});

	});

	describe("with factory functions", () => {

		it("returns the materialized value", async () => {

			const factory = () => resource({});

			const value = materialize(factory);

			expect(value.kind).toBe("resource");

		});

		it("caches factory results for idempotent materialization", async () => {

			const factory = () => resource({});

			const first = materialize(factory);
			const second = materialize(factory);

			expect(first).toBe(second);

		});

		it("caches independently per factory", async () => {

			const factoryA = () => resource({});
			const factoryB = () => resource({});

			const shapeA = materialize(factoryA);
			const shapeB = materialize(factoryB);

			expect(shapeA).not.toBe(shapeB);

		});

	});

});
