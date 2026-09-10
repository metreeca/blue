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

import type { Lazy, Optional } from "@metreeca/core";
import type { Shape } from "./_.js";


/**
 * Description of a cardinality-constrained value set.
 *
 * Pairs the shape the values are drawn from with the bounds on their number, so that the set a property declares and
 * the set a path resolves to are described alike.
 *
 * @typeParam R The shape the values are drawn from, possibly deferred to break definition cycles
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Range<
	R extends Lazy<Shape> = Lazy<Shape>,
	L extends RangeCount = RangeCount,
	U extends RangeCount = RangeCount
> = {

	/**
	 * Shape the values are drawn from.
	 */
	readonly range: R

	/**
	 * Least number of values admitted.
	 *
	 * @defaultValue `undefined` (no lower bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MinCountConstraintComponent SHACL § 4.2.1 sh:minCount}
	 */
	readonly minCount: L

	/**
	 * Greatest number of values admitted.
	 *
	 * @defaultValue `undefined` (no upper bound)
	 *
	 * @see {@link https://www.w3.org/TR/shacl/#MaxCountConstraintComponent SHACL § 4.2.2 sh:maxCount}
	 */
	readonly maxCount: U

}

/**
 * A cardinality bound, absent where the range states none.
 */
export type RangeCount =
	Optional<number>


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Resolves the form a value takes at the arity its bounds admit.
 *
 * Yields a bare value where the range admits at most one, an array otherwise, marking the form optional unless at
 * least one value is {@link Skippable | known to be required}. Bounds beyond the four the cardinality factories name
 * are honoured all the same, so a lower bound of two admits the same non-empty form as one.
 *
 * @typeParam V The value the range describes
 * @typeParam L The least number of values admitted
 * @typeParam U The greatest number of values admitted
 */
export type Arity<V, L extends RangeCount, U extends RangeCount> =
	[U] extends [1]
		? Skippable<L> extends true ? undefined | V : V
		: Skippable<L> extends true ? undefined | readonly V[]
			: readonly [V, ...V[]]

/**
 * Checks whether a lower bound lets the values be left out.
 *
 * Yields `true` unless at least one value is known to be required, so a bound stated as zero and a bound left
 * unstated both admit absence, as does one stated only as a number.
 *
 * @typeParam L The least number of values admitted
 */
export type Skippable<L extends RangeCount> =
	undefined extends L ? true
		: 0 extends L ? true
			: false
