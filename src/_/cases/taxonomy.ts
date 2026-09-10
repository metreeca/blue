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

import { multiple, reference, required, resource, string } from "../_.js";
import { Dataset, Resource } from "./dataset.js";
import { ec2u } from "./ec2u.js";
import { Concept, ConceptScheme } from "./skos.js";


export function Taxonomy() {
	return resource(Dataset, ConceptScheme, {

		resources: multiple(reference(Topic)),

		hasConcept: multiple(reference(Topic)),
		hasTopConcept: multiple(reference(Topic))

	}, {

		space: ec2u,
		class: ec2u.Taxonomy

	});
}

export function Topic() {
	return resource(Resource, Concept, {

		digest: required(string, {

			hidden: true

		})

	}, {

		space: ec2u,
		class: ec2u.Topic

	});
}
