export interface FinicityAuthResponse {
  token: string;
}

export interface FinicityCustomerResponse {
  id: string;
  username: string;
  createdDate: number;
}

export interface FinicityGenerateConnectUrlResponse {
  link: string;
}

export interface FinicityConnectUrlRequest {
  customerId?: string;
  institutionId?: number;
}

export interface FinicityConnectUrlResult {
  customerId: string;
  connectUrl: string;
  institutionId?: number;
  usedTestingCustomer: boolean;
}
