//type e non interface, sintassi diversa ma in questo caso piu performante 

export type StopBatchRequestDto = {
  create: {
    tempId: string;
    name: string;
    lat: number;
    lng: number;
  }[];
  update: {
    id: number;
    name: string;
    lat: number;
    lng: number;
  }[];
  delete: number[];
};

export type StopBatchResponseDto = {
  created: {
    tempId: string;
    id: number;
    name: string;
    lat: number | null;
    lng: number | null;
  }[];
  updated: {
    id: number;
    name: string;
    lat: number | null;
    lng: number | null;
  }[];
  deleted: number[];
};
