import { BaseFilter } from "bloom-filters";
import prisma from "../db/client";

interface IDeserializedFilter {
  fromJSON: (json: JSON) => BaseFilter;
}

/**
 *  Get a bloom filter from the database.
 * @param name Name of the filter in database
 * @param cls Class of the filter to deserialize
 * @returns Deserialized filter of type T
 * @throws Error if no filter is found in database
 */
export async function getFilter<T extends BaseFilter>(
  name: string,
  cls: IDeserializedFilter
): Promise<T> {
  // findUnique + an explicit throw, rather than findUniqueOrThrow: callers
  // (NoteIdFilter.deserializeFromDb) branch on this exact message, and Prisma's
  // own "not found" message is not part of its API -- it changed between 4 and 5,
  // which silently turned "filter missing" into a 500.
  const bloomFilter = await prisma.bloomFilter.findUnique({
    where: {
      name: name,
    },
  });
  if (bloomFilter === null) {
    throw new Error("No BloomFilter found");
  }
  const serializedFilter = bloomFilter.serializedFilter;
  return deserializeFilter<T>(serializedFilter, cls);
}

/**
 * Creates a filter in the database if it does not exist yet.
 * If it exists, it will be overwritten.
 * @param name Name of the filter in database
 * @param filter filter object to serialize
 */
export async function upsertFilter(
  name: string,
  filter: BaseFilter
): Promise<void> {
  const serializedFilter = serializeFilter(filter);
  await prisma.bloomFilter.upsert({
    where: {
      name: name,
    },
    update: {
      serializedFilter: serializedFilter,
    },
    create: {
      name: name,
      serializedFilter: serializedFilter,
    },
  });
}

// Prisma 7 maps `Bytes` to Uint8Array rather than Buffer. TextEncoder/TextDecoder
// are UTF-8 in both directions, so this stays byte-compatible with filters that
// were written by the previous Buffer.from(..., "utf-8") implementation.
function serializeFilter(filter: BaseFilter): Uint8Array<ArrayBuffer> {
  const filterJSON = filter.saveAsJSON();
  const filterString = JSON.stringify(filterJSON);
  // Re-wrap: TextEncoder is typed as Uint8Array<ArrayBufferLike>, but Prisma's
  // Bytes field wants the narrower Uint8Array<ArrayBuffer>.
  return new Uint8Array(new TextEncoder().encode(filterString));
}

function deserializeFilter<T extends BaseFilter>(
  serializedFilter: Uint8Array,
  cls: IDeserializedFilter
): T {
  const filterString = new TextDecoder("utf-8").decode(serializedFilter);
  const filterJSON = JSON.parse(filterString);
  const filter = cls.fromJSON(filterJSON) as T;
  return filter;
}
