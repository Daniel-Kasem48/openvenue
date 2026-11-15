export const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
