export interface LineStopEditorDto {
    lineStopId: number;
    stopId: number;
    stopName: string;
    stopSequence: number;
    shapeOffsetM?: number | null;
}


export interface LineWithStopsEditorDto {
    lineId: number;
    lineLabel: string;
    stops: LineStopEditorDto[];
}