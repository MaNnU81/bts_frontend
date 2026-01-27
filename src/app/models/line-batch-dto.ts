export interface LineStopUpsertDto {
  stopId: number;
  stopSequence: number;        // 1-based
  shapeOffsetM?: number | null;
}

export interface LineCreateDto {
  tempId: string;
  number: number;
  direction: string;
  route: string;
  shapeGeoJson: string;
  stops: LineStopUpsertDto[];
}

export interface LineUpdateDto {
  id: number;
  number: number;
  direction: string;
  route: string;
  shapeGeoJson: string;
  stops: LineStopUpsertDto[];
}

export interface LineBatchRequestDto {
  create?: LineCreateDto[];
  update?: LineUpdateDto[];
  delete?: number[];
}

export interface LineStopResultDto {
  lineStopId: number;
  stopId: number;
  stopSequence: number;
  shapeOffsetM?: number | null;
}

export interface LineCreateResultDto {
  tempId: string;
  id: number;
  number: number;
  direction: string;
  route: string;
  stops: LineStopResultDto[];
}

export interface LineUpdateResultDto {
  id: number;
  number: number;
  direction: string;
  route: string;
  stops: LineStopResultDto[];
}

export interface LineBatchResponseDto {
  created: LineCreateResultDto[];
  updated: LineUpdateResultDto[];
  deleted: number[];
}
