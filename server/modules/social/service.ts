export async function persistThenPublish<Result>(
  persist: () => Promise<Result>,
  publish: (result: Result) => void,
): Promise<Result> {
  const result = await persist();
  publish(result);
  return result;
}
