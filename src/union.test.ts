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
import { boolean } from "./boolean.js";
import { decimal, integer } from "./number.js";
import { reference } from "./reference.js";
import { resource } from "./resource.js";
import { date, email, string } from "./string.js";
import { text } from "./text.js";
import { deriveUnion, mergeUnion, narrowsUnion } from "./union.core.js";
import { union } from "./union.js";
import { required } from "./value.js";


describe("factories", () => {

	describe("union", () => {

		it("produces indexed model from variant models", async () => {

			const shape = union(string(), integer());

			expect(shape.model).toEqual({ "0": "", "1": 0 });

		});

		it("rejects a text variant at the type level", async () => {

			// localised text is a whole-property type, never a union variant: a single language map
			// cannot mix into the value set alongside the literals, references, and resources of the
			// other branches. Text is not a ValueShape, so rejection is purely static — no runtime
			// guard re-checks the type constraint

			// @ts-expect-error - text is not a ValueShape and cannot be a union variant
			union(string(), text());
			// @ts-expect-error - text is not a ValueShape and cannot be a union variant
			union(text());

		});

		it("produces indexed model for boolean variants", async () => {

			const shape = union(string(), boolean());

			expect(shape.model).toEqual({ "0": "", "1": false });

		});

	});

});

describe("operators", () => {

	describe("narrowsUnion", () => {

		it("accepts a subset child", async () => {

			expect(narrowsUnion(union(string()), union(string(), boolean()))).toBeUndefined();

		});

		it("accepts order-independent matching", async () => {

			expect(narrowsUnion(union(boolean(), string()), union(string(), boolean()))).toBeUndefined();

		});

		it("rejects a child variant narrowing no base variant", async () => {

			expect(narrowsUnion(union(integer()), union(string(), boolean()))).toBeDefined();

		});

		it("rejects an ambiguous match", async () => {

			expect(narrowsUnion(union(string()), union(string(), string()))).toBeDefined();

		});

		it("rejects two child variants narrowing the same base variant", async () => {

			expect(narrowsUnion(union(string({ model: "hello", minLength: 5 }), string({
				model: "12345678",
				minLength: 8
			})), union(string()))).toBeDefined();

		});

	});

	describe("mergeUnion", () => {

		describe("variants", () => {

			it("tightens each child variant onto the base variant it narrows", async () => {

				const merged = mergeUnion(
					union(string({ model: "hello", minLength: 5 }), boolean()),
					union(string(), boolean())
				);

				expect(merged.kind).toBe("union");
				expect(merged.variants).toHaveLength(2);
				expect((merged.variants[0] as any).minLength).toBe(5);

			});

			it("matches variants regardless of order, keeping base order", async () => {

				const merged = mergeUnion(
					union(boolean(), string()),
					union(string(), boolean())
				);

				expect(merged.variants.map(variant => variant.kind)).toEqual(["string", "boolean"]);

			});

			it("drops base variants the child omits", async () => {

				const merged = mergeUnion(
					union(string()),
					union(string(), boolean())
				);

				expect(merged.variants).toHaveLength(1);
				expect(merged.variants[0].kind).toBe("string");

			});

			it("drops a distinct class-less reference variant", async () => {

				const A = resource({ name: required(string()) });
				const B = resource({ name: required(integer()) });

				const merged = mergeUnion(
					union(reference(A)),
					union(reference(A), reference(B))
				);

				expect(merged.variants).toHaveLength(1);
				expect(merged.variants[0].kind).toBe("reference");

			});

			it("tightens the matching numeric variant", async () => {

				const merged = mergeUnion(
					union(integer()),
					union(integer(), decimal())
				);

				expect(merged.variants).toHaveLength(1);
				expect(merged.model).toEqual({ "0": 0 });

			});

			it("tightens the matching string variant", async () => {

				const merged = mergeUnion(
					union(date()),
					union(date(), email())
				);

				expect(merged.variants).toHaveLength(1);
				expect(merged.model).toEqual({ "0": "1970-01-01" });

			});

			it("tightens the matching reference variant", async () => {

				const Person = resource({ class: "http://example.org/Person" }, { name: required(string()) });
				const Org = resource({ class: "http://example.org/Org" }, { name: required(string()) });

				const merged = mergeUnion(
					union(reference(Person)),
					union(reference(Person), reference(Org))
				);

				expect(merged.variants).toHaveLength(1);
				expect(merged.variants[0].kind).toBe("reference");

			});

			it("tightens the matching resource variant", async () => {

				const Person = resource({ class: "http://example.org/Person" }, { name: required(string()) });
				const Org = resource({ class: "http://example.org/Org" }, { name: required(string()) });

				const merged = mergeUnion(
					union(Person),
					union(Person, Org)
				);

				expect(merged.variants).toHaveLength(1);
				expect(merged.variants[0].kind).toBe("resource");

			});

			it("rejects a child variant narrowing no base variant", async () => {

				expect(() => mergeUnion(
					union(string(), boolean(), integer()),
					union(string(), boolean())
				)).toThrow(RangeError);

			});

			it("rejects a child variant that widens its base variant", async () => {

				expect(() => mergeUnion(
					union(string({ model: "x", minLength: 1 }), boolean()),
					union(string({ model: "hello", minLength: 5 }), boolean())
				)).toThrow(RangeError);

			});

			it("rejects a child variant narrowing several base variants", async () => {

				expect(() => mergeUnion(
					union(string(), integer()),
					union(string(), string(), integer())
				)).toThrow(RangeError);

			});

			it("rejects two child variants narrowing the same base variant", async () => {

				expect(() => mergeUnion(
					union(string({ model: "hello", minLength: 5 }), string({ model: "12345678", minLength: 8 })),
					union(string())
				)).toThrow(RangeError);

			});

		});

		describe("model", () => {

			it("computes merged model from merged variants", async () => {

				const merged = mergeUnion(
					union(string(), boolean()),
					union(string(), boolean())
				);

				expect(merged.model).toEqual({ "0": "", "1": false });

			});

			it("re-indexes contiguously after dropping a variant", async () => {

				const merged = mergeUnion(
					union(string(), integer()),
					union(string(), boolean(), integer())
				);

				expect(merged.model).toEqual({ "0": "", "1": 0 });

			});

		});

	});

	describe("deriveUnion", () => {

		it("indexes each variant's derived model", async () => {

			expect(deriveUnion(union(string(), integer()))).toEqual({ "0": "", "1": 0 });

		});

		it("derives reference variant identifiers", async () => {

			const target = resource({ pattern: "/things/{id}" }, {});

			expect(deriveUnion(union(reference(target), string()))).toEqual({ "0": "app:/things/0", "1": "" });

		});

	});

});
