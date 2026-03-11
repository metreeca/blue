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
import { brand, branded } from "./brand.js";


describe("branding", () => {

	describe("branded", () => {

		const sym = Symbol("test");

		it.each([
			["null", null],
			["undefined", undefined],
			["string", "hello"],
			["number", 42],
			["boolean", true]
		])("returns undefined for non-object (%s)", (_label, value) => {

			expect(branded(value, sym)).toBeUndefined();

		});

		it("returns undefined when symbol is absent", async () => {

			expect(branded({}, sym)).toBeUndefined();

		});

		it("returns payload when symbol is present", async () => {

			const value = brand({ x: 1 }, { [sym]: "payload" });

			expect(branded(value, sym)).toBe("payload");

		});

	});

	describe("brand", () => {

		const sym = Symbol("test");
		const sym2 = Symbol("test2");

		it("attaches payload to extensible object", async () => {

			const value = { x: 1 };
			const result = brand(value, { [sym]: "payload" });

			expect(branded(result, sym)).toBe("payload");

		});

		it("attaches payload to frozen object", async () => {

			const value = Object.freeze({ x: 1 });
			const result = brand(value, { [sym]: "payload" });

			expect(branded(result, sym)).toBe("payload");

		});

		it("preserves properties on frozen object", async () => {

			const value = Object.freeze({ x: 1, y: 2 });
			const result = brand(value, { [sym]: "payload" });

			expect(result.x).toBe(1);
			expect(result.y).toBe(2);

		});

		it("returns immutable result", async () => {

			const result = brand({ x: 1 }, { [sym]: "payload" });

			expect(() => {
				(result as any).x = 99;
			}).toThrow();

		});

		it("returns non-object unchanged", async () => {

			expect(brand(42, { [sym]: "payload" })).toBe(42);
			expect(brand("hello", { [sym]: "payload" })).toBe("hello");
			expect(brand(null, { [sym]: "payload" })).toBeNull();

		});

		it("overwrites previous payload on re-brand", async () => {

			const first = brand({ x: 1 }, { [sym]: "a" });
			const second = brand(first, { [sym]: "b" });

			expect(branded(second, sym)).toBe("b");

		});

		it("attaches multiple symbols at once", async () => {

			const result = brand({ x: 1 }, { [sym]: "a", [sym2]: "b" });

			expect(branded(result, sym)).toBe("a");
			expect(branded(result, sym2)).toBe("b");

		});

	});

});
