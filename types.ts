import React from 'react';

export interface Language {
  id: string;
  name: string;
  nativeName: string;
  description: string;
  courseCount: number;
  image: string;
  color: string;
  buttonColor: string;
  voiceName: string; // For Gemini Live config
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive?: boolean;
}

export interface AudioVisualizerProps {
  isActive: boolean;
  volume: number;
}