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

import { markdown, text } from "../../string.js";
import { reference } from "../../../reference.js";
import { property, resource } from "../../../resource.js";
import { date } from "../../../string.js";
import { multiple, optional, required, type State } from "../../../value.js";
import { dct } from "../terms/dublincore.js";
import { ec2u, Entity } from "../terms/ec2u.js";
import { Resource } from "./resources.js";


export type Dataset = State<typeof Dataset>


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function Dataset() {
	return resource({

		extends: Entity,
		namespace: dct

	}, {

		title: required(text),
		alternative: required(text),
		description: required(markdown),

		created: optional(date),
		issued: optional(date),
		modified: optional(date),

		// !!! Organization publisher();

		source: optional(reference(Entity)),

		rights: optional(text),
		license: multiple(reference(Entity)),
		accessRights: optional(markdown),

		// !!! Set<Topic> subject();

		resources: property({

			forward: ec2u.resource,
			reverse: ec2u.dataset

		}, multiple(reference(Resource, { foreign: true }))) // !!! foreign to property

	});
}
