
import React from 'react';

export interface SocialProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
}

export enum LoginStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}