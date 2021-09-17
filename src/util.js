
/**
 * Returns a new Promise which is resovled to the input `promise` if the 
 * input promise's result was available withint timeout. Otherwise,
 * it will result in the Error.
 * 
 * @param {*} promise 
 */
export const setPromiseTimeout = (promise, timeout) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Promise timed out'));
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]).then((response) => {
    clearTimeout(timeoutId);
    return response;
  });
}