// officeGraph.test.js
import { mocked } from '../../node_modules/ts-jest/utils'
import { OfficeGraph } from '../officeGraph';

jest.mock('../officeGraph');
const mockedOfficeGraph = mocked(OfficeGraph, true);

test('deep', () => {
    var fakeResult = new Promise<any>(async (resolve, reject) => {
            return resolve("totallyJson");
    });

    mockedOfficeGraph.prototype.patch.mockReturnValue(fakeResult);
    var result = mockedOfficeGraph.prototype.patch("test", "test", "test");
    expect(mockedOfficeGraph.prototype.patch.mock.calls).toHaveLength(1);
    expect(result).toEqual(fakeResult);
});