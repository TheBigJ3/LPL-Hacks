import type { PopupComponentProps } from '@stores/popupStore'
import {
  IMAGE_CROP_MAX_ZOOM,
  IMAGE_CROP_MIN_ZOOM,
  useImageCrop,
} from './.ts'
import './.css'

type ImageCropPopupProps = PopupComponentProps & {

  file: File

  aspectRatio: number

  outputWidth?: number
  round?: boolean
  title?: string
  onSave?: (file: File) => void
}

export default function ImageCropPopup({
  id,
  file,
  aspectRatio,
  outputWidth,
  round = false,
  title = 'Crop Image',
  onSave,
}: ImageCropPopupProps) {
  const crop = useImageCrop({ id, file, aspectRatio, outputWidth, onSave })

  return (
    <div className='image-crop-popup flex w-full max-w-[560px] flex-col gap-[12px] rounded-[12px] bg-popup-gray p-[12px] font-[Arimo]'>
      <div className='flex items-center justify-between'>
        <p className='m-0 text-[16px] font-bold tracking-[-0.32px] text-main-white'>{title}</p>
        <button
          type='button'
          onClick={crop.dismiss}
          aria-label='Close'
          className='flex cursor-pointer items-center justify-center text-main-white'
        >
          <span className='material-symbols-outlined text-[20px]' translate='no' aria-hidden='true'>
            close
          </span>
        </button>
      </div>

      <div
        ref={crop.stageRef}
        className='image-crop-popup__stage'
        data-ready={crop.ready}
        onPointerDown={crop.handlePointerDown}
        onPointerMove={crop.handlePointerMove}
        onPointerUp={crop.handlePointerEnd}
        onPointerCancel={crop.handlePointerEnd}
      >
        <div ref={crop.frameRef} className='image-crop-popup__frame' data-round={round} style={crop.frameStyle}>
          {crop.src && (
            <img
              ref={crop.imageRef}
              className='image-crop-popup__image'
              src={crop.src}
              alt='Image being cropped'
              draggable={false}
              style={crop.imageStyle}
              onLoad={crop.handleLoad}
              onError={crop.handleError}
            />
          )}
          <div className='image-crop-popup__mask' />
        </div>

        {crop.error && (
          <p className='absolute inset-x-[12px] bottom-[12px] m-0 rounded-[8px] bg-black/70 px-[12px] py-[8px] text-center text-[14px] tracking-[-0.28px] text-[#ff383c]'>
            {crop.error}
          </p>
        )}
      </div>

      <div className='flex items-center gap-[12px]'>
        <button
          type='button'
          onClick={crop.zoomOut}
          disabled={!crop.canZoomOut}
          aria-label='Zoom out'
          className='flex cursor-pointer items-center justify-center text-main-white disabled:cursor-default disabled:opacity-40'
        >
          <span className='material-symbols-outlined text-[20px]' translate='no' aria-hidden='true'>
            zoom_out
          </span>
        </button>

        <input
          type='range'
          min={IMAGE_CROP_MIN_ZOOM}
          max={IMAGE_CROP_MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={crop.handleZoomChange}
          disabled={!crop.ready}
          aria-label='Zoom'
          className='min-w-0 flex-1 cursor-pointer accent-main-white disabled:cursor-default'
        />

        <button
          type='button'
          onClick={crop.zoomIn}
          disabled={!crop.canZoomIn}
          aria-label='Zoom in'
          className='flex cursor-pointer items-center justify-center text-main-white disabled:cursor-default disabled:opacity-40'
        >
          <span className='material-symbols-outlined text-[20px]' translate='no' aria-hidden='true'>
            zoom_in
          </span>
        </button>

        <button
          type='button'
          onClick={crop.save}
          disabled={!crop.ready || crop.saving}
          className='ml-[12px] cursor-pointer rounded-full bg-main-white px-[16px] py-[8px] text-[14px] tracking-[-0.28px] text-main-black disabled:cursor-default disabled:bg-[#5c5c5c] disabled:text-paragraph-off-white'
        >
          Save
        </button>
      </div>
    </div>
  )
}
