export interface ZHABackup {
    version: number;
    backup_time?: string;
    network_info: {
      extended_pan_id: string;
      pan_id: string;
      channel: number;
      channel_mask: number[];
      security_level: number;
      nwk_update_id: number;
      network_key: {
        key: string;
        seq: number;
        tx_counter: number;
      };
      stack_specific?: {
        ezsp?: {
          hashed_tclk?: string;
        };
      };
      metadata?: {
        ezspVersion?: number;
      };
      source?: string;
    };
    node_info: {
      ieee: string;
    };
  }
  
  export interface HADevice {
    id: string
    identifiers: [string, string][];
    name_by_user: string | null;
    name: string;
    area_id?: string | null;
  }
  
  export interface HARegistry {
    data: {
      devices: HADevice[];
    };
  }

  export interface HAArea {
    id: string;
    name: string;
  }

  export interface HAAreaRegistry {
    data: {
      areas: HAArea[];
    };
  }
  
  export interface Z2MConfig {
    advanced: {
      pan_id: number;
      ext_pan_id: number[];
      channel: number;
      network_key: number[];
    };
    devices: {
      [key: string]: {
        friendly_name: string;
      };
    };
  }

  export interface Z2MDeviceEntry {
    ieee: string;
    nwk: number;
  }