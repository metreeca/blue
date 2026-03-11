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
 * Symbol-keyed branding operators.
 *
 * @module
 */

import { isObject } from "@metreeca/core";
import { immutable } from "@metreeca/core/nested";

/**
 * Retrieves the payload associated with a symbol-keyed brand property on a value.
 *
 * Supports idempotency patterns where repeated operations can be skipped on already-processed values.
 *
 * @typeParam T The expected payload type
 *
 * @param value The value to inspect
 * @param tag The symbol key to look up
 *
 * @returns The payload associated with the symbol key if the value is an object carrying it; `undefined` otherwise
 */
export function branded<T>(value: unknown, tag: symbol): T | undefined {

	return isObject(value) && tag in value
		? value[tag] as T
		: undefined;

}

/**
 * Attaches symbol-keyed properties to a value, returning an immutable copy.
 *
 * Supports idempotency patterns where repeated operations can be skipped on already-processed values.
 * Non-object values are returned unchanged.
 *
 * @typeParam V The value type
 *
 * @param value The value to brand
 * @param tags Map of symbol keys to payloads to attach
 *
 * @returns An immutable copy of the value with all symbol-keyed properties attached; non-object values are returned
 *     unchanged
 */
export function brand<V>(value: V, tags: { readonly [key: symbol]: unknown }): V {

	if ( isObject(value) ) {

		return immutable(Object.getOwnPropertySymbols(tags).reduce(
			(copy, symbol) => Object.defineProperty(copy, symbol, {

				enumerable: false,
				configurable: true,

				value: tags[symbol]

			}),
			Object.isExtensible(value) ? value : { ...value }
		));

	} else {

		return value;

	}

}
