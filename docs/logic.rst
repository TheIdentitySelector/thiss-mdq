Filtering logic in thiss-mdq
============================


Here we give a summary of the filtering logic that SPs can use to provide their users with a pre-selected subset of all the IdPs that the MDQ service knows about.

There are 2 sources of IdPs:
* federated metadata
* extra metadata added per SP.

These 2 sources result in the global set of IdPs available for an SP. We call this set **IdP**. 

When the extra metadata added by an SP has an entity with the same entityID as an entity in the federated metadata,
the one added to **IdP** will be the one provided by the SP.

**IdP** is filtered to obtain the subsets that are provided to the users, with 2 criteria:
* fulltext queried by the end user
* a trust profile set by the SP site

Only IdPs that agree with the fulltext query of the end user are ever returned. We call **q-IdP** this subset of **IdP**.

Filtering by profile is applied on **q-IdP**.

A profile will produce a subset of **q-IdP**, we call this **p-IdP**.

Profiles can be strict or non-strict.
* a strict profile will only result in **p-IdP**
* a non-strict profile will result in **q-IdP**, but with all elements that are in **p-IdP** marked with a property `hint` set to `true`.

Profiles can have 2 types of filtering clauses:
* entities - that select subsets of **q-IdP** according to properties of the IdPs
* entity - that select individual IdPs by their entityID.

Filtering clauses can be include or non-include.

entities clauses are ANDed, irrespective of them being include or non-include.

non-include entity clauses are ANDed to the entities clauses.

include entity clauses are ORed to the AND clause formed by the entities and non-include entity clauses, to obtain a filtering clause that is applied to **q-IdP** to obtain **p-IdP**.
