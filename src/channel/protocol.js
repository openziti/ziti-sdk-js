/*
Copyright 2019-2020 Netfoundry, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/



const ZitiEnums = {

    VERSION: [0x03, 0x06, 0x09, 0x0c],

    HEADER_LENGTH: 20,

    conn_state: {

      Initial:    0,
      Connecting: 1,
      Connected:  2,
      Binding:    3,
      Bound:      4,
      Accepting:  5,
      Timedout:   6,
      Closed:     7,  

    },

    content_type: {

      HelloType:    0,
      PingType:     1,
      ResultType:   2,
      LatencyType:  3,
  
      // EDGE
      Connect:        60783,
      StateConnected: 60784,
      StateClosed:    60785,
      Data:           60786,
      Dial:           60787,
      DialSuccess:    60788,
      DialFailed:     60789,
      Bind:           60790,
      Unbind:         60791,

    },
  
    header_id: {

      ConnectionId: 0,
      ReplyFor: 1,
      ResultSuccess: 2,
      HelloListener: 3,
  
      // Headers in the range 128-255 inclusive will be reflected when creating replies
      ReflectedHeaderBitMask: 1 << 7,
      MaxReflectedHeader: (1 << 8) - 1,
  
      ConnId: 1000,
      SeqHeader: 1001,
      SessionToken: 1002,
      PublicKey: 1003,
    
    },

    header_type: {
      IntType: 0,
      StringType: 1,
      Uint8ArrayType: 2,
    }
  

  /*
   * Channel V2 Wire Format
   *
   *  [ message section ]
   * <version:[]byte{0x03,0x06,0x09,0x0c}>  0   1  2  3
   * <content-type:int32>                   4   5  6  7
   * <sequence:int32>                       8   9 10 11
   * <headers-length:int32>							    12 13 14 15
   * <body-length:int32>								    16 17 18 19
   *
   *  [ data section ]
   * <headers>										          20 -> (20 + headers-length)
   * <body>											           (20 + headers-length) -> (20 + headers-length + body-length)
   */



}

module.exports = ZitiEnums;
